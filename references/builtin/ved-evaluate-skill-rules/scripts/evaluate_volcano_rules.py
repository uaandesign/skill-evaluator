#!/usr/bin/env python3
"""Deterministic phase-1 evaluator for VolcanoDesign skill naming and structure rules."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple

STANDARD_VERSION = "volcano-skill-rules-v1"
PHASE = "phase-1-naming-structure"
BANNED_VERBS = {"process", "handle", "do", "run", "manage"}
ALLOWED_TOP_LEVEL_DIRS = {"references", "scripts", "assets", "agents"}
ALLOWED_TOP_LEVEL_FILES = {"SKILL.md", "LICENSE", "LICENSE.md", "LICENSE.txt", "license.txt"}

CATEGORY_META: Dict[str, Dict[str, str]] = {
    "naming_required_rules": {
        "display_name_zh": "命名强制规则",
        "description_zh": "检查 ved 前缀、kebab-case、结构、禁用动词和词数建议。",
    },
    "skill_frontmatter": {
        "display_name_zh": "SKILL.md 与 frontmatter",
        "description_zh": "检查 SKILL.md、frontmatter、name 和 description 是否规范。",
    },
    "directory_structure": {
        "display_name_zh": "目录结构",
        "description_zh": "检查根目录文件、允许目录和资源路径类型是否正确。",
    },
}

CHECK_META: Dict[str, Dict[str, str]] = {
    "N1": {"title_zh": "使用 ved 前缀", "description_zh": "检查名称是否以 ved- 开头。", "pass_message_zh": "名称已使用 ved- 前缀。", "fail_message_zh": "名称没有使用 ved- 前缀。"},
    "N2": {"title_zh": "使用 kebab-case", "description_zh": "检查名称是否全部小写并使用中划线分隔。", "pass_message_zh": "名称格式符合 kebab-case。", "fail_message_zh": "名称不是 kebab-case，可能包含大写、下划线或空格。"},
    "N3": {"title_zh": "符合 ved 加动词加名词结构", "description_zh": "检查名称是否符合 ved 加动词加名词结构。", "pass_message_zh": "名称符合 ved 加动词加名词结构。", "fail_message_zh": "名称不符合 ved 加动词加名词结构。"},
    "N4": {"title_zh": "未使用禁用泛动词", "description_zh": "检查 ved 后的首个动词是否不是 process、handle、do、run、manage。", "pass_message_zh": "名称没有使用禁用泛动词。", "fail_message_zh": "名称使用了禁用泛动词。"},
    "N5": {"title_zh": "词数符合 3-5 词建议", "description_zh": "检查名称词数是否控制在 3-5 个词，包含 ved。", "pass_message_zh": "名称词数符合 3-5 词建议。", "fail_message_zh": "名称词数不在 3-5 个词建议范围内。"},
    "F1": {"title_zh": "存在 SKILL.md", "description_zh": "检查 skill 根目录是否包含 SKILL.md。", "pass_message_zh": "已检测到 SKILL.md。", "fail_message_zh": "缺少 SKILL.md 文件。"},
    "F2": {"title_zh": "存在 YAML frontmatter", "description_zh": "检查 SKILL.md 是否包含 YAML frontmatter。", "pass_message_zh": "SKILL.md 包含有效的 YAML frontmatter。", "fail_message_zh": "SKILL.md 缺少 YAML frontmatter。"},
    "F3": {"title_zh": "name 与目录名一致", "description_zh": "检查 frontmatter 中的 name 是否与目录名一致。", "pass_message_zh": "frontmatter 的 name 与目录名一致。", "fail_message_zh": "frontmatter 的 name 与目录名不一致。"},
    "F4": {"title_zh": "description 非空", "description_zh": "检查 frontmatter 中是否存在非空 description。", "pass_message_zh": "frontmatter 的 description 存在且非空。", "fail_message_zh": "frontmatter 的 description 缺失或为空。"},
    "S1": {"title_zh": "SKILL.md 位于根目录", "description_zh": "检查 SKILL.md 是否位于 skill 根目录。", "pass_message_zh": "SKILL.md 位于 skill 根目录。", "fail_message_zh": "SKILL.md 不在 skill 根目录。"},
    "S2": {"title_zh": "可选目录合法", "description_zh": "检查顶层可选目录是否仅使用 references、scripts、assets 或 agents。", "pass_message_zh": "顶层可选目录使用规范。", "fail_message_zh": "存在不允许的顶层目录。"},
    "S3": {"title_zh": "无未知顶层资源", "description_zh": "检查根目录中是否存在未知的顶层文件或目录。", "pass_message_zh": "未发现未知顶层资源。", "fail_message_zh": "发现未知的顶层文件或目录。"},
    "S4": {"title_zh": "资源路径类型正确", "description_zh": "检查 references、scripts、assets 如果存在，是否为目录。", "pass_message_zh": "资源路径类型正确。", "fail_message_zh": "references、scripts 或 assets 中存在不是目录的路径。"},
}


@dataclass(frozen=True)
class Check:
    category: str
    check_id: str
    points: int
    severity: str
    title: str
    evaluator: Callable[["Context"], Tuple[bool, str]]


@dataclass
class Context:
    skill_path: Path
    skill_md: Path
    folder_name: str
    skill_text: str
    frontmatter_text: str
    body: str
    frontmatter: Dict[str, str]
    files: List[Path]
    top_level_dirs: List[str]
    top_level_files: List[str]


def normalize_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def parse_frontmatter(skill_text: str) -> Tuple[str, str, Dict[str, str]]:
    if not skill_text.startswith("---\n"):
        return "", skill_text, {}
    match = re.match(r"^---\n(.*?)\n---\n?(.*)$", skill_text, re.S)
    if not match:
        return "", skill_text, {}
    frontmatter_text = match.group(1)
    body = match.group(2)
    parsed: Dict[str, str] = {}
    current_key: Optional[str] = None
    block_lines: List[str] = []

    def flush_block() -> None:
        nonlocal current_key, block_lines
        if current_key is not None and block_lines:
            parsed[current_key] = "\n".join(line.strip() for line in block_lines).strip()
        current_key = None
        block_lines = []

    for raw_line in frontmatter_text.split("\n"):
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        if raw_line.startswith((" ", "\t")) and current_key is not None:
            block_lines.append(raw_line)
            continue
        flush_block()
        match_line = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", raw_line)
        if not match_line:
            continue
        key, value = match_line.group(1), match_line.group(2).strip()
        if value in {"|", ">"}:
            current_key = key
            block_lines = []
            parsed[key] = ""
        else:
            parsed[key] = value.strip("\"'")
    flush_block()
    return frontmatter_text, body, parsed


def collect_files(skill_path: Path) -> List[Path]:
    files = []
    for path in skill_path.rglob("*"):
        if path.is_file() and not any(part.startswith(".") for part in path.relative_to(skill_path).parts):
            files.append(path)
    return sorted(files, key=lambda p: p.relative_to(skill_path).as_posix())


def build_context(skill_path: Path) -> Context:
    skill_path = skill_path.resolve()
    skill_md = skill_path / "SKILL.md"
    skill_text = normalize_text(skill_md.read_text(encoding="utf-8")) if skill_md.exists() else ""
    frontmatter_text, body, frontmatter = parse_frontmatter(skill_text)
    files = collect_files(skill_path) if skill_path.exists() else []
    top_level_dirs = sorted(
        path.name for path in skill_path.iterdir() if path.is_dir() and not path.name.startswith(".")
    ) if skill_path.exists() else []
    top_level_files = sorted(
        path.name for path in skill_path.iterdir() if path.is_file() and not path.name.startswith(".")
    ) if skill_path.exists() else []
    return Context(
        skill_path=skill_path,
        skill_md=skill_md,
        folder_name=skill_path.name,
        skill_text=skill_text,
        frontmatter_text=frontmatter_text,
        body=body,
        frontmatter=frontmatter,
        files=files,
        top_level_dirs=top_level_dirs,
        top_level_files=top_level_files,
    )


def fingerprint(ctx: Context) -> str:
    digest = hashlib.sha256()
    for path in ctx.files:
        rel = path.relative_to(ctx.skill_path).as_posix()
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        data = normalize_text(path.read_text(encoding="utf-8", errors="replace"))
        digest.update(data.encode("utf-8"))
        digest.update(b"\0")
    return digest.hexdigest()


def volcano_name(ctx: Context) -> str:
    return ctx.frontmatter.get("name", "").strip() or ctx.folder_name


def name_parts(name: str) -> List[str]:
    return [part for part in name.split("-") if part]


def is_kebab_case(name: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name))


def has_ved_prefix(ctx: Context) -> Tuple[bool, str]:
    name = volcano_name(ctx)
    ok = name.startswith("ved-")
    return ok, f"name={name!r}" if ok else f"name={name!r} does not start with ved-"


def uses_kebab_case(ctx: Context) -> Tuple[bool, str]:
    name = volcano_name(ctx)
    ok = is_kebab_case(name)
    return ok, "uses kebab-case" if ok else f"name={name!r} is not kebab-case"


def has_verb_noun_structure(ctx: Context) -> Tuple[bool, str]:
    name = volcano_name(ctx)
    parts = name_parts(name)
    ok = len(parts) >= 3 and parts[0] == "ved" and bool(parts[1]) and bool(parts[2])
    return ok, f"parts={parts}" if ok else f"expected ved-<verb>-<noun>, got parts={parts}"


def avoids_banned_verbs(ctx: Context) -> Tuple[bool, str]:
    name = volcano_name(ctx)
    parts = name_parts(name)
    verb = parts[1] if len(parts) > 1 else ""
    ok = verb not in BANNED_VERBS
    return ok, f"verb={verb!r}" if ok else f"banned verb={verb!r}"


def word_count_recommended(ctx: Context) -> Tuple[bool, str]:
    name = volcano_name(ctx)
    count = len(name_parts(name))
    ok = 3 <= count <= 5
    return ok, f"word_count={count}" if ok else f"word_count={count}, expected 3-5 including ved"


def skill_md_exists(ctx: Context) -> Tuple[bool, str]:
    ok = ctx.skill_md.exists()
    return ok, "SKILL.md exists" if ok else "SKILL.md missing"


def has_frontmatter(ctx: Context) -> Tuple[bool, str]:
    ok = bool(ctx.frontmatter_text)
    return ok, "frontmatter exists" if ok else "frontmatter missing"


def name_matches_folder(ctx: Context) -> Tuple[bool, str]:
    name = ctx.frontmatter.get("name", "").strip()
    ok = bool(name) and name == ctx.folder_name
    return ok, f"name={name!r}, folder={ctx.folder_name!r}"


def description_present(ctx: Context) -> Tuple[bool, str]:
    description = ctx.frontmatter.get("description", "").strip()
    ok = bool(description)
    return ok, f"description length={len(description)}"


def skill_md_at_root(ctx: Context) -> Tuple[bool, str]:
    ok = "SKILL.md" in ctx.top_level_files
    return ok, "SKILL.md at root" if ok else "SKILL.md not found at root"


def optional_dirs_allowed(ctx: Context) -> Tuple[bool, str]:
    unexpected = sorted(set(ctx.top_level_dirs) - ALLOWED_TOP_LEVEL_DIRS)
    return not unexpected, "top-level dirs allowed" if not unexpected else f"unexpected dirs={unexpected}"


def no_unknown_top_level_resources(ctx: Context) -> Tuple[bool, str]:
    unexpected_files = sorted(set(ctx.top_level_files) - ALLOWED_TOP_LEVEL_FILES)
    unexpected_dirs = sorted(set(ctx.top_level_dirs) - ALLOWED_TOP_LEVEL_DIRS)
    unexpected = unexpected_files + unexpected_dirs
    return not unexpected, "no unknown top-level resources" if not unexpected else f"unexpected top-level entries={unexpected}"


def optional_resource_paths_are_dirs(ctx: Context) -> Tuple[bool, str]:
    bad = []
    for dirname in ["references", "scripts", "assets"]:
        candidate = ctx.skill_path / dirname
        if candidate.exists() and not candidate.is_dir():
            bad.append(dirname)
    return not bad, "optional resource paths are directories" if not bad else f"not directories={bad}"


def localize_check_message(check_id: str, passed: bool, raw_evidence: str) -> str:
    meta = CHECK_META[check_id]
    message = meta["pass_message_zh"] if passed else meta["fail_message_zh"]
    if check_id in {"N1", "N2", "N3", "N4", "N5", "F3", "S2", "S3", "S4"} and not passed and raw_evidence:
        return f"{message} 说明：{raw_evidence}。"
    if check_id == "F4" and raw_evidence:
        return f"{message} 说明：{raw_evidence}。"
    return message


CHECKS: List[Check] = [
    Check("naming_required_rules", "N1", 15, "hard", "ved- prefix", has_ved_prefix),
    Check("naming_required_rules", "N2", 10, "hard", "kebab-case", uses_kebab_case),
    Check("naming_required_rules", "N3", 10, "hard", "ved-verb-noun structure", has_verb_noun_structure),
    Check("naming_required_rules", "N4", 10, "hard", "avoid banned verbs", avoids_banned_verbs),
    Check("naming_required_rules", "N5", 10, "warning", "3-5 words", word_count_recommended),
    Check("skill_frontmatter", "F1", 5, "hard", "SKILL.md exists", skill_md_exists),
    Check("skill_frontmatter", "F2", 5, "hard", "frontmatter exists", has_frontmatter),
    Check("skill_frontmatter", "F3", 10, "hard", "name matches folder", name_matches_folder),
    Check("skill_frontmatter", "F4", 5, "normal", "description exists", description_present),
    Check("directory_structure", "S1", 5, "hard", "SKILL.md at root", skill_md_at_root),
    Check("directory_structure", "S2", 5, "normal", "optional dirs allowed", optional_dirs_allowed),
    Check("directory_structure", "S3", 5, "normal", "no unknown top-level resources", no_unknown_top_level_resources),
    Check("directory_structure", "S4", 5, "normal", "optional resource paths are dirs", optional_resource_paths_are_dirs),
]


def assessment_for(score: int, hard_failures: List[Dict[str, object]], warnings: List[Dict[str, object]]) -> Dict[str, object]:
    if hard_failures or score < 80:
        tag = "不通过"
        reason = "存在硬规则失败，或总分低于 80。"
    elif warnings or score < 90:
        tag = "警告"
        reason = "没有硬规则失败，但存在建议项问题或总分为 80-89。"
    else:
        tag = "通过"
        reason = "总分不低于 90，且没有硬规则失败和警告项。"
    return {
        "tag": tag,
        "reason": reason,
        "hard_failure_count": len(hard_failures),
        "warning_count": len(warnings),
    }


def evaluate(skill_path: Path) -> Dict[str, object]:
    ctx = build_context(skill_path)
    check_results = []
    category_scores: Dict[str, Dict[str, object]] = {}

    for check in CHECKS:
        if check.category not in category_scores:
            category_scores[check.category] = {
                "earned": 0,
                "available": 0,
                "display_name_zh": CATEGORY_META[check.category]["display_name_zh"],
                "description_zh": CATEGORY_META[check.category]["description_zh"],
                "total_checks": 0,
                "passed_checks": 0,
                "failed_checks": 0,
            }
        category_scores[check.category]["available"] += check.points
        category_scores[check.category]["total_checks"] += 1
        passed, evidence = check.evaluator(ctx)
        earned = check.points if passed else 0
        category_scores[check.category]["earned"] += earned
        if passed:
            category_scores[check.category]["passed_checks"] += 1
        else:
            category_scores[check.category]["failed_checks"] += 1
        meta = CHECK_META[check.check_id]
        check_results.append(
            {
                "id": check.check_id,
                "category": check.category,
                "category_name_zh": CATEGORY_META[check.category]["display_name_zh"],
                "severity": check.severity,
                "title": check.title,
                "title_zh": meta["title_zh"],
                "description_zh": meta["description_zh"],
                "passed": passed,
                "earned": earned,
                "available": check.points,
                "evidence": localize_check_message(check.check_id, passed, evidence),
                "debug_evidence": evidence,
                "result_message_zh": localize_check_message(check.check_id, passed, evidence),
            }
        )

    score = sum(item["earned"] for item in check_results)
    hard_failures = [item for item in check_results if not item["passed"] and item["severity"] == "hard"]
    warnings = [item for item in check_results if not item["passed"] and item["severity"] == "warning"]
    return {
        "standard_version": STANDARD_VERSION,
        "phase": PHASE,
        "skill_path": str(ctx.skill_path),
        "evaluated_name": volcano_name(ctx),
        "fingerprint": fingerprint(ctx) if ctx.skill_path.exists() else "",
        "score": score,
        "volcano_assessment": assessment_for(score, hard_failures, warnings),
        "category_scores": category_scores,
        "checks": check_results,
        "hard_failures": hard_failures,
        "warnings": warnings,
    }


def render_markdown(result: Dict[str, object]) -> str:
    assessment = result["volcano_assessment"]
    lines = [
        "# VolcanoDesign Skill 规则评估报告",
        "",
        f"- Standard version: `{result['standard_version']}`",
        f"- Phase: `{result['phase']}`",
        f"- Skill path: `{result['skill_path']}`",
        f"- Evaluated name: `{result['evaluated_name']}`",
        f"- Fingerprint: `{result['fingerprint']}`",
        f"- Score: **{result['score']}/100**",
        f"- 火山规则评估: **{assessment['tag']}**",
        f"- 原因: {assessment['reason']}",
        "",
        "## Category Scores",
        "",
        "| Category | Earned | Available | Percent |",
        "| --- | ---: | ---: | ---: |",
    ]
    category_scores = result["category_scores"]
    assert isinstance(category_scores, dict)
    for category, score in category_scores.items():
        earned = score["earned"]
        available = score["available"]
        percent = round((earned / available) * 100) if available else 0
        label = score.get("display_name_zh", category)
        lines.append(f"| `{category}` / {label} | {earned} | {available} | {percent}% |")

    hard_failures = result["hard_failures"]
    warnings = result["warnings"]

    lines.extend(["", "## Hard Failures", ""])
    if hard_failures:
        lines.extend(["| ID | 检查项 | 维度 | 说明 |", "| --- | --- | --- | --- |"])
        for item in hard_failures:
            finding = str(item["result_message_zh"]).replace("|", "\\|")
            title = str(item["title_zh"]).replace("|", "\\|")
            category_name = str(item["category_name_zh"]).replace("|", "\\|")
            lines.append(f"| {item['id']} | {title} | {category_name} | {finding} |")
    else:
        lines.append("无硬规则失败。")

    lines.extend(["", "## Warnings", ""])
    if warnings:
        lines.extend(["| ID | 检查项 | 维度 | 说明 |", "| --- | --- | --- | --- |"])
        for item in warnings:
            finding = str(item["result_message_zh"]).replace("|", "\\|")
            title = str(item["title_zh"]).replace("|", "\\|")
            category_name = str(item["category_name_zh"]).replace("|", "\\|")
            lines.append(f"| {item['id']} | {title} | {category_name} | {finding} |")
    else:
        lines.append("无警告项。")

    return "\n".join(lines) + "\n"


def write_output(output: Optional[Path], content: str) -> None:
    if output is None:
        print(content, end="")
        return
    output.write_text(content, encoding="utf-8")


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate VolcanoDesign phase-1 naming and structure rules for a skill folder."
    )
    parser.add_argument("skill_path", type=Path, help="Path to the skill folder to evaluate.")
    parser.add_argument("--format", choices=["json", "md"], default="json", help="Output format.")
    parser.add_argument("--output", type=Path, help="Write report to this file instead of stdout.")
    return parser.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    if not args.skill_path.exists() or not args.skill_path.is_dir():
        print(f"error: skill path does not exist or is not a directory: {args.skill_path}", file=sys.stderr)
        return 2
    result = evaluate(args.skill_path)
    if args.format == "json":
        content = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    else:
        content = render_markdown(result)
    write_output(args.output, content)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
