#!/usr/bin/env python3
"""Deterministic generic evaluator for Codex skill folders."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple

RUBRIC_VERSION = "generic-skill-rubric-v1"
MAX_NAME_LENGTH = 64
EXPECTED_RESOURCE_DIRS = {"agents", "assets", "references", "scripts"}
PLACEHOLDER_RE = re.compile(
    r"(\[TODO|TODO:|This is a placeholder|Replace with actual|Delete this entire|"
    r"Example helper script|Example Reference Documentation|Example Asset File|\bTBD\b)",
    re.I,
)
TOKEN_RE = re.compile(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]")
DESTRUCTIVE_RE = re.compile(r"\b(rm\s+-rf|git\s+reset\s+--hard|git\s+clean\s+-fd|mkfs|dd\s+if=)", re.I)
SECRET_RE = re.compile(
    r"(api[_-]?key|secret|password|token)\s*[:=]\s*['\"]?(sk-|AKIA|xox[baprs]-|ghp_|[A-Za-z0-9_/+=-]{24,})",
    re.I,
)

CATEGORY_META: Dict[str, Dict[str, str]] = {
    "metadata_and_triggering": {
        "display_name_zh": "元数据与触发能力",
        "description_zh": "检查 SKILL.md frontmatter、name、description 和触发语义是否完整。",
    },
    "procedural_usefulness": {
        "display_name_zh": "流程可执行性",
        "description_zh": "检查正文是否包含流程、输入、输出、验证和具体调用方式。",
    },
    "progressive_disclosure_and_concision": {
        "display_name_zh": "渐进披露与简洁性",
        "description_zh": "检查正文简洁性、资源引用和模板残留。",
    },
    "resource_integration": {
        "display_name_zh": "资源集成",
        "description_zh": "检查脚本、引用资料和资源目录是否可被稳定使用。",
    },
    "validation_readiness": {
        "display_name_zh": "验证就绪度",
        "description_zh": "检查是否说明验证方式、成功标准、基线对比和证据产物。",
    },
    "safety_and_operational_reliability": {
        "display_name_zh": "安全性与运行可靠性",
        "description_zh": "检查破坏性操作护栏、依赖权限说明和密钥反模式。",
    },
}

CHECK_META: Dict[str, Dict[str, str]] = {
    "M1": {"title_zh": "SKILL.md 与 frontmatter 存在", "description_zh": "检查是否存在 SKILL.md，且文件以有效 YAML frontmatter 开头。", "pass_message_zh": "已检测到 SKILL.md 和有效的 YAML frontmatter。", "fail_message_zh": "缺少 SKILL.md，或 SKILL.md 没有有效的 YAML frontmatter。"},
    "M2": {"title_zh": "name 字段合法", "description_zh": "检查 frontmatter 中的 name 是否为合法的 hyphen-case 名称。", "pass_message_zh": "frontmatter 的 name 字段格式正确。", "fail_message_zh": "frontmatter 的 name 字段缺失，或不是合法的 hyphen-case 名称。"},
    "M3": {"title_zh": "description 非空", "description_zh": "检查 frontmatter 中是否存在非空 description。", "pass_message_zh": "frontmatter 的 description 字段存在且非空。", "fail_message_zh": "frontmatter 的 description 字段缺失或为空。"},
    "M4": {"title_zh": "description 包含触发语义", "description_zh": "检查 description 是否说明何时触发该 skill。", "pass_message_zh": "description 已包含触发语义。", "fail_message_zh": "description 没有明确说明触发场景或使用时机。"},
    "M5": {"title_zh": "description 具体且长度合理", "description_zh": "检查 description 是否足够具体，长度是否在 40-1024 字符之间，且不含尖括号。", "pass_message_zh": "description 的具体性和长度符合要求。", "fail_message_zh": "description 过短、过长、过于含糊，或包含不允许的尖括号。"},
    "P1": {"title_zh": "存在一级标题", "description_zh": "检查正文是否有清晰的一级标题。", "pass_message_zh": "正文包含清晰的一级标题。", "fail_message_zh": "正文缺少清晰的一级标题。"},
    "P2": {"title_zh": "包含流程或步骤", "description_zh": "检查正文是否包含工作流、步骤或顺序执行说明。", "pass_message_zh": "正文包含流程或步骤说明。", "fail_message_zh": "正文没有明确的流程、步骤或工作流描述。"},
    "P3": {"title_zh": "说明输入或前置条件", "description_zh": "检查正文是否说明输入、目标路径、文件或前置条件。", "pass_message_zh": "正文已说明输入或前置条件。", "fail_message_zh": "正文没有明确说明输入、目标路径或前置条件。"},
    "P4": {"title_zh": "说明输出或完成标准", "description_zh": "检查正文是否说明输出结果、交付物或完成标准。", "pass_message_zh": "正文已说明输出或完成标准。", "fail_message_zh": "正文没有明确说明输出结果、交付物或完成标准。"},
    "P5": {"title_zh": "包含验证或质量门禁", "description_zh": "检查正文是否说明验证方式、测试方式或质量门禁。", "pass_message_zh": "正文包含验证或质量门禁说明。", "fail_message_zh": "正文没有明确说明验证方式、测试方式或质量门禁。"},
    "P6": {"title_zh": "包含具体命令或示例", "description_zh": "检查正文是否提供可直接执行的命令、示例或调用方式。", "pass_message_zh": "正文包含具体命令或示例。", "fail_message_zh": "正文缺少具体命令、示例或可执行调用方式。"},
    "D1": {"title_zh": "正文简洁", "description_zh": "检查 SKILL.md 正文是否控制在约定长度内。", "pass_message_zh": "正文长度符合简洁性要求。", "fail_message_zh": "正文过长，超出建议的行数或近似 token 范围。"},
    "D2": {"title_zh": "引用 references 资源", "description_zh": "当存在 references 目录时，检查正文是否正确引用。", "pass_message_zh": "references 资源引用关系正确。", "fail_message_zh": "存在 references 目录，但正文没有正确引用对应资料。"},
    "D3": {"title_zh": "引用 scripts 资源", "description_zh": "当存在 scripts 目录时，检查正文是否正确引用。", "pass_message_zh": "scripts 资源引用关系正确。", "fail_message_zh": "存在 scripts 目录，但正文没有正确引用对应脚本。"},
    "D4": {"title_zh": "无模板残留", "description_zh": "检查 skill 中是否残留 TODO、占位文本或初始化模板内容。", "pass_message_zh": "未发现模板残留或占位内容。", "fail_message_zh": "发现 TODO、占位文本或初始化模板残留。"},
    "D5": {"title_zh": "无辅助杂物文件", "description_zh": "检查 skill 根目录是否残留 README、CHANGELOG 等非必要辅助文件。", "pass_message_zh": "未发现不必要的辅助杂物文件。", "fail_message_zh": "skill 根目录存在不必要的辅助杂物文件。"},
    "R1": {"title_zh": "资源位置规范", "description_zh": "检查资源文件是否位于 scripts、references、assets 或 agents 等允许目录。", "pass_message_zh": "资源文件位置符合约定。", "fail_message_zh": "存在放置位置不符合约定的资源文件。"},
    "R2": {"title_zh": "脚本有执行入口", "description_zh": "检查脚本是否包含 shebang、main 入口或明确 usage。", "pass_message_zh": "脚本执行入口完整。", "fail_message_zh": "部分脚本缺少可直接识别的执行入口。"},
    "R3": {"title_zh": "脚本可展示帮助信息", "description_zh": "检查脚本是否提供 argparse、usage 或 help 信息。", "pass_message_zh": "脚本包含帮助信息或参数说明。", "fail_message_zh": "部分脚本缺少帮助信息或参数说明。"},
    "R4": {"title_zh": "引用资料有标题", "description_zh": "检查 references 下的 Markdown 文件是否包含一级标题。", "pass_message_zh": "引用资料标题结构完整。", "fail_message_zh": "部分引用资料缺少一级标题。"},
    "R5": {"title_zh": "资源目录无示例占位文件", "description_zh": "检查资源目录中是否保留初始化生成的示例占位文件。", "pass_message_zh": "资源目录中没有示例占位文件。", "fail_message_zh": "资源目录中仍保留示例占位文件。"},
    "V1": {"title_zh": "包含验证语言", "description_zh": "检查正文是否说明验证、评估、测试或检查。", "pass_message_zh": "正文已说明验证或评估方式。", "fail_message_zh": "正文没有明确说明验证、评估、测试或检查。"},
    "V2": {"title_zh": "包含成功标准", "description_zh": "检查正文是否说明通过阈值、成功标准或接受条件。", "pass_message_zh": "正文已说明成功标准或阈值。", "fail_message_zh": "正文没有明确说明通过阈值、成功标准或接受条件。"},
    "V3": {"title_zh": "包含版本或基线对比说明", "description_zh": "检查正文是否说明修订、迭代、版本或基线对比。", "pass_message_zh": "正文已说明修订、版本或基线对比方式。", "fail_message_zh": "正文没有明确说明修订、版本或基线对比方式。"},
    "V4": {"title_zh": "包含证据产物说明", "description_zh": "检查正文是否说明报告、JSON、日志、diff 等证据产物。", "pass_message_zh": "正文已说明证据产物。", "fail_message_zh": "正文没有明确说明报告、JSON、日志、diff 等证据产物。"},
    "V5": {"title_zh": "包含验证完整性说明", "description_zh": "检查正文是否说明稳定性、随机性、上下文泄露或副作用风险。", "pass_message_zh": "正文已说明验证完整性风险。", "fail_message_zh": "正文没有明确说明稳定性、随机性、上下文泄露或副作用风险。"},
    "S1": {"title_zh": "破坏性操作有护栏", "description_zh": "检查是否存在未加安全说明的破坏性操作。", "pass_message_zh": "未发现缺少护栏的破坏性操作。", "fail_message_zh": "发现破坏性操作，但缺少确认、批准或安全护栏说明。"},
    "S2": {"title_zh": "说明依赖与权限", "description_zh": "检查正文是否说明依赖、权限、环境或前置要求。", "pass_message_zh": "依赖、权限或环境说明完整。", "fail_message_zh": "正文缺少依赖、权限、环境或前置要求说明。"},
    "S3": {"title_zh": "说明副作用护栏", "description_zh": "检查正文是否说明确认、批准、沙箱或避免副作用的约束。", "pass_message_zh": "正文包含副作用护栏说明。", "fail_message_zh": "正文没有明确说明确认、批准、沙箱或避免副作用的约束。"},
    "S4": {"title_zh": "无密钥反模式", "description_zh": "检查 skill 中是否存在明显的密钥、token 或凭据反模式。", "pass_message_zh": "未发现明显的密钥或凭据反模式。", "fail_message_zh": "发现疑似硬编码密钥、token 或凭据反模式。"},
}


@dataclass(frozen=True)
class Check:
    category: str
    check_id: str
    points: int
    title: str
    evaluator: Callable[["Context"], Tuple[bool, str]]


@dataclass
class Context:
    skill_path: Path
    skill_md: Path
    skill_text: str
    frontmatter_text: str
    body: str
    frontmatter: Dict[str, str]
    files: List[Path]
    resource_files: List[Path]
    script_files: List[Path]
    reference_files: List[Path]
    top_level_files: List[str]


def normalize_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def approx_tokens(text: str) -> int:
    return len(TOKEN_RE.findall(text))


def contains_any(text: str, needles: Iterable[str]) -> bool:
    lowered = text.lower()
    return any(needle.lower() in lowered for needle in needles)


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
        rel_parts = path.relative_to(skill_path).parts
        if "__pycache__" in rel_parts or path.suffix == ".pyc":
            continue
        if path.is_file() and not any(part.startswith(".") for part in rel_parts):
            files.append(path)
    return sorted(files, key=lambda p: p.relative_to(skill_path).as_posix())


def build_context(skill_path: Path) -> Context:
    skill_path = skill_path.resolve()
    skill_md = skill_path / "SKILL.md"
    skill_text = normalize_text(skill_md.read_text(encoding="utf-8")) if skill_md.exists() else ""
    frontmatter_text, body, frontmatter = parse_frontmatter(skill_text)
    files = collect_files(skill_path) if skill_path.exists() else []
    resource_files = [
        path
        for path in files
        if len(path.relative_to(skill_path).parts) >= 2
        and path.relative_to(skill_path).parts[0] in EXPECTED_RESOURCE_DIRS
    ]
    script_files = [path for path in resource_files if path.relative_to(skill_path).parts[0] == "scripts"]
    reference_files = [path for path in resource_files if path.relative_to(skill_path).parts[0] == "references"]
    top_level_files = sorted(
        path.name for path in files if len(path.relative_to(skill_path).parts) == 1
    )
    return Context(
        skill_path=skill_path,
        skill_md=skill_md,
        skill_text=skill_text,
        frontmatter_text=frontmatter_text,
        body=body,
        frontmatter=frontmatter,
        files=files,
        resource_files=resource_files,
        script_files=script_files,
        reference_files=reference_files,
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


def file_text(path: Path) -> str:
    return normalize_text(path.read_text(encoding="utf-8", errors="replace"))


def relative_names(paths: Iterable[Path], root: Path) -> List[str]:
    return [path.relative_to(root).as_posix() for path in paths]


def placeholder_hits(text: str) -> List[str]:
    hits: List[str] = []
    for line in text.split("\n"):
        if not PLACEHOLDER_RE.search(line):
            continue
        stripped = line.strip()
        if stripped.startswith(('r"', "r'")):
            continue
        lowered = line.lower()
        if "placeholder_re" in lowered or "placeholder marker" in lowered or "placeholder resources" in lowered:
            continue
        hits.append(stripped)
    return hits


def has_skill_md(ctx: Context) -> Tuple[bool, str]:
    ok = ctx.skill_md.exists() and ctx.skill_text.startswith("---\n") and bool(ctx.frontmatter_text)
    return ok, "SKILL.md has YAML delimiters" if ok else "SKILL.md missing valid YAML delimiters"


def valid_name(ctx: Context) -> Tuple[bool, str]:
    name = ctx.frontmatter.get("name", "").strip()
    ok = bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name)) and len(name) <= MAX_NAME_LENGTH
    return ok, f"name={name!r}" if name else "missing name"


def nonempty_description(ctx: Context) -> Tuple[bool, str]:
    description = ctx.frontmatter.get("description", "").strip()
    return bool(description), f"description length={len(description)}"


def trigger_description(ctx: Context) -> Tuple[bool, str]:
    description = ctx.frontmatter.get("description", "")
    terms = ["use when", "when", "for", "trigger", "用于", "当", "适用", "使用"]
    ok = contains_any(description, terms)
    return ok, "description includes trigger language" if ok else "description lacks trigger language"


def specific_description(ctx: Context) -> Tuple[bool, str]:
    description = ctx.frontmatter.get("description", "").strip()
    ok = 40 <= len(description) <= 1024 and "<" not in description and ">" not in description
    return ok, f"description length={len(description)}"


def top_title(ctx: Context) -> Tuple[bool, str]:
    ok = bool(re.search(r"^#\s+\S+", ctx.body, re.M))
    return ok, "top-level title found" if ok else "top-level title missing"


def workflow_language(ctx: Context) -> Tuple[bool, str]:
    terms = ["workflow", "steps", "step ", "process", "procedure", "checklist", "流程", "步骤", "执行", "工作流"]
    ok = contains_any(ctx.body, terms) or bool(re.search(r"^\s*\d+\.\s+", ctx.body, re.M))
    return ok, "workflow or ordered steps found" if ok else "workflow language missing"


def input_prereq(ctx: Context) -> Tuple[bool, str]:
    terms = ["input", "target", "path", "file", "folder", "prerequisite", "requires", "locate", "输入", "目标", "路径", "文件", "目录", "前置"]
    ok = contains_any(ctx.body, terms)
    return ok, "input/prerequisite language found" if ok else "input/prerequisite language missing"


def output_completion(ctx: Context) -> Tuple[bool, str]:
    terms = ["output", "deliver", "report", "result", "completion", "done", "emit", "produce", "输出", "报告", "结果", "交付", "完成"]
    ok = contains_any(ctx.body, terms)
    return ok, "output/completion language found" if ok else "output/completion language missing"


def validation_instructions(ctx: Context) -> Tuple[bool, str]:
    terms = ["validate", "validation", "test", "check", "quality", "gate", "score", "评估", "验证", "测试", "检查", "质量", "评分"]
    ok = contains_any(ctx.body, terms)
    return ok, "validation language found" if ok else "validation language missing"


def concrete_examples(ctx: Context) -> Tuple[bool, str]:
    ok = "```" in ctx.body or "$ " in ctx.body or bool(re.search(r"\bpython3?\s+.+\.py\b", ctx.body))
    return ok, "concrete command or code fence found" if ok else "concrete command missing"


def concise_body(ctx: Context) -> Tuple[bool, str]:
    lines = ctx.body.count("\n") + (1 if ctx.body else 0)
    tokens = approx_tokens(ctx.body)
    ok = lines <= 500 and tokens <= 5000
    return ok, f"body lines={lines}, approx_tokens={tokens}"


def references_linked(ctx: Context) -> Tuple[bool, str]:
    if not ctx.reference_files:
        return True, "no reference files"
    names = [path.name for path in ctx.reference_files]
    ok = any(name in ctx.body for name in names) or "references/" in ctx.body
    return ok, f"reference files={', '.join(names)}"


def scripts_linked(ctx: Context) -> Tuple[bool, str]:
    if not ctx.script_files:
        return True, "no script files"
    names = [path.name for path in ctx.script_files]
    ok = any(name in ctx.body for name in names) or "scripts/" in ctx.body
    return ok, f"script files={', '.join(names)}"


def no_placeholders(ctx: Context) -> Tuple[bool, str]:
    skill_hits = placeholder_hits(ctx.skill_text)
    resource_hits = [
        path.relative_to(ctx.skill_path).as_posix()
        for path in ctx.resource_files
        if placeholder_hits(file_text(path))
    ]
    ok = not skill_hits and not resource_hits
    if ok:
        return True, "no placeholder markers"
    return False, f"placeholder markers found: {', '.join(resource_hits) or skill_hits[0]}"


def no_auxiliary_clutter(ctx: Context) -> Tuple[bool, str]:
    clutter = {"README.md", "INSTALLATION_GUIDE.md", "QUICK_REFERENCE.md", "CHANGELOG.md"}
    found = sorted(clutter.intersection(ctx.top_level_files))
    return not found, "no auxiliary clutter files" if not found else f"clutter files={', '.join(found)}"


def expected_resource_locations(ctx: Context) -> Tuple[bool, str]:
    unexpected = []
    allowed_top = EXPECTED_RESOURCE_DIRS.union({"SKILL.md", "LICENSE", "LICENSE.md", "LICENSE.txt", "license.txt"})
    for path in ctx.files:
        rel_parts = path.relative_to(ctx.skill_path).parts
        if rel_parts[0] not in allowed_top:
            unexpected.append(path.relative_to(ctx.skill_path).as_posix())
    return not unexpected, "resource locations are expected" if not unexpected else f"unexpected files={', '.join(unexpected)}"


def scripts_entrypoint(ctx: Context) -> Tuple[bool, str]:
    if not ctx.script_files:
        return True, "no scripts"
    bad = []
    for path in ctx.script_files:
        text = file_text(path)
        if not (text.startswith("#!") or 'if __name__ == "__main__"' in text or "Usage:" in text or "usage:" in text):
            bad.append(path.name)
    return not bad, "all scripts have entry points" if not bad else f"missing entry point={', '.join(bad)}"


def scripts_help(ctx: Context) -> Tuple[bool, str]:
    if not ctx.script_files:
        return True, "no scripts"
    bad = []
    for path in ctx.script_files:
        text = file_text(path)
        if not ("argparse" in text or "--help" in text or "Usage:" in text or "usage:" in text):
            bad.append(path.name)
    return not bad, "all scripts expose CLI help/usage" if not bad else f"missing CLI help={', '.join(bad)}"


def reference_headings(ctx: Context) -> Tuple[bool, str]:
    if not ctx.reference_files:
        return True, "no references"
    bad = [path.name for path in ctx.reference_files if not re.search(r"^#\s+\S+", file_text(path), re.M)]
    return not bad, "all references have headings" if not bad else f"missing headings={', '.join(bad)}"


def no_resource_placeholders(ctx: Context) -> Tuple[bool, str]:
    bad = [
        path.relative_to(ctx.skill_path).as_posix()
        for path in ctx.resource_files
        if placeholder_hits(file_text(path))
    ]
    return not bad, "no placeholder resource files" if not bad else f"placeholder resources={', '.join(bad)}"


def success_thresholds(ctx: Context) -> Tuple[bool, str]:
    terms = ["threshold", "pass", "fail", "accept", "reject", "score", "band", "criteria", "成功", "通过", "失败", "阈值", "标准", "评分"]
    ok = contains_any(ctx.body, terms)
    return ok, "success/threshold language found" if ok else "success/threshold language missing"


def revision_baseline(ctx: Context) -> Tuple[bool, str]:
    terms = ["revision", "iterate", "baseline", "compare", "version", "delta", "变更", "迭代", "基线", "对比", "版本"]
    ok = contains_any(ctx.body, terms)
    return ok, "revision/baseline language found" if ok else "revision/baseline language missing"


def evidence_artifacts(ctx: Context) -> Tuple[bool, str]:
    terms = ["report", "json", "log", "diff", "artifact", "output", "fingerprint", "报告", "日志", "产物", "证据", "输出"]
    ok = contains_any(ctx.body, terms)
    return ok, "evidence artifact language found" if ok else "evidence artifact language missing"


def validation_integrity(ctx: Context) -> Tuple[bool, str]:
    terms = ["deterministic", "random", "network", "timestamp", "leaked context", "nondeterminism", "unsafe", "稳定", "随机", "网络", "时间戳", "泄露", "副作用"]
    ok = contains_any(ctx.body, terms)
    return ok, "validation integrity language found" if ok else "validation integrity language missing"


def destructive_safety(ctx: Context) -> Tuple[bool, str]:
    text = ctx.skill_text
    has_destructive = bool(DESTRUCTIVE_RE.search(text))
    has_safety = contains_any(text, ["confirm", "approval", "safe", "backup", "ask", "确认", "批准", "备份", "安全"])
    ok = not has_destructive or has_safety
    return ok, "no unsafe destructive pattern" if ok else "destructive pattern without safety language"


def prerequisites_permissions(ctx: Context) -> Tuple[bool, str]:
    has_commands = "```" in ctx.body or ctx.script_files
    if not has_commands:
        return True, "no commands or scripts"
    terms = ["prerequisite", "requires", "dependency", "environment", "permission", "install", "python", "前置", "依赖", "环境", "权限"]
    ok = contains_any(ctx.body, terms)
    return ok, "prerequisite/dependency language found" if ok else "prerequisite/dependency language missing"


def side_effect_guardrails(ctx: Context) -> Tuple[bool, str]:
    terms = ["confirm", "approval", "sandbox", "side effect", "avoid", "do not", "without", "确认", "批准", "沙箱", "副作用", "避免", "不要"]
    ok = contains_any(ctx.body, terms)
    return ok, "side-effect guardrail language found" if ok else "side-effect guardrail language missing"


def no_secret_antipattern(ctx: Context) -> Tuple[bool, str]:
    ok = not SECRET_RE.search(ctx.skill_text)
    return ok, "no obvious secret values" if ok else "possible hardcoded secret found"


def localize_check_message(check_id: str, passed: bool, raw_evidence: str) -> str:
    meta = CHECK_META[check_id]
    message = meta["pass_message_zh"] if passed else meta["fail_message_zh"]
    if check_id == "D4" and not passed and ":" in raw_evidence:
        detail = raw_evidence.split(":", 1)[1].strip()
        return f"{message} 问题位置：{detail}。"
    if check_id == "R5" and not passed and "=" in raw_evidence:
        detail = raw_evidence.split("=", 1)[1].strip()
        return f"{message} 问题资源：{detail}。"
    if check_id in {"R1", "D5"} and not passed and "=" in raw_evidence:
        detail = raw_evidence.split("=", 1)[1].strip()
        return f"{message} 具体项：{detail}。"
    if check_id in {"M2", "M3", "M5"} and raw_evidence:
        return f"{message} 说明：{raw_evidence}。"
    return message


CHECKS: List[Check] = [
    Check("metadata_and_triggering", "M1", 3, "SKILL.md frontmatter exists", has_skill_md),
    Check("metadata_and_triggering", "M2", 3, "Valid skill name", valid_name),
    Check("metadata_and_triggering", "M3", 3, "Non-empty description", nonempty_description),
    Check("metadata_and_triggering", "M4", 3, "Description has trigger language", trigger_description),
    Check("metadata_and_triggering", "M5", 3, "Description is specific and bounded", specific_description),
    Check("procedural_usefulness", "P1", 3, "Top-level title", top_title),
    Check("procedural_usefulness", "P2", 4, "Workflow or steps", workflow_language),
    Check("procedural_usefulness", "P3", 3, "Inputs or prerequisites", input_prereq),
    Check("procedural_usefulness", "P4", 3, "Outputs or completion criteria", output_completion),
    Check("procedural_usefulness", "P5", 4, "Validation or quality gates", validation_instructions),
    Check("procedural_usefulness", "P6", 3, "Concrete examples or commands", concrete_examples),
    Check("progressive_disclosure_and_concision", "D1", 4, "Concise body", concise_body),
    Check("progressive_disclosure_and_concision", "D2", 3, "References linked", references_linked),
    Check("progressive_disclosure_and_concision", "D3", 3, "Scripts linked", scripts_linked),
    Check("progressive_disclosure_and_concision", "D4", 3, "No placeholders", no_placeholders),
    Check("progressive_disclosure_and_concision", "D5", 2, "No auxiliary clutter", no_auxiliary_clutter),
    Check("resource_integration", "R1", 3, "Expected resource locations", expected_resource_locations),
    Check("resource_integration", "R2", 3, "Scripts have entry points", scripts_entrypoint),
    Check("resource_integration", "R3", 3, "Scripts expose CLI help", scripts_help),
    Check("resource_integration", "R4", 3, "References have headings", reference_headings),
    Check("resource_integration", "R5", 3, "No resource placeholders", no_resource_placeholders),
    Check("validation_readiness", "V1", 4, "Validation language", validation_instructions),
    Check("validation_readiness", "V2", 4, "Success thresholds", success_thresholds),
    Check("validation_readiness", "V3", 4, "Revision or baseline guidance", revision_baseline),
    Check("validation_readiness", "V4", 4, "Evidence artifacts", evidence_artifacts),
    Check("validation_readiness", "V5", 4, "Validation integrity", validation_integrity),
    Check("safety_and_operational_reliability", "S1", 4, "Destructive safety", destructive_safety),
    Check("safety_and_operational_reliability", "S2", 4, "Prerequisites or permissions", prerequisites_permissions),
    Check("safety_and_operational_reliability", "S3", 3, "Side-effect guardrails", side_effect_guardrails),
    Check("safety_and_operational_reliability", "S4", 4, "No secret anti-patterns", no_secret_antipattern),
]


def grade_for(score: int) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def generic_assessment_for(score: int, category_scores: Dict[str, Dict[str, int]]) -> Dict[str, object]:
    below_threshold = []
    for category, values in category_scores.items():
        available = values["available"]
        earned = values["earned"]
        percent = (earned / available) * 100 if available else 100
        if percent < 70:
            below_threshold.append(
                {
                    "category": category,
                    "earned": earned,
                    "available": available,
                    "percent": round(percent, 2),
                }
            )

    if score >= 90 and not below_threshold:
        tag = "通过"
        reason = "总分不低于 90，且所有一级维度得分均不低于 70%。"
    elif score < 80:
        tag = "不通过"
        reason = "总分低于 80，未达到通用准入要求。"
    else:
        tag = "警告"
        if below_threshold:
            reason = "总分达到最低线，但存在一级维度得分低于 70%。"
        else:
            reason = "总分为 80-89，需要关注少量质量缺口。"

    return {
        "tag": tag,
        "reason": reason,
        "category_threshold": 70,
        "below_threshold_categories": below_threshold,
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
    generic_assessment = generic_assessment_for(score, category_scores)
    return {
        "rubric_version": RUBRIC_VERSION,
        "skill_path": str(ctx.skill_path),
        "fingerprint": fingerprint(ctx) if ctx.skill_path.exists() else "",
        "score": score,
        "grade": grade_for(score),
        "generic_assessment": generic_assessment,
        "category_scores": category_scores,
        "checks": check_results,
    }


def load_baseline(path: Optional[Path]) -> Optional[Dict[str, object]]:
    if path is None:
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def add_baseline_comparison(result: Dict[str, object], baseline: Optional[Dict[str, object]]) -> None:
    if baseline is None:
        return
    result["baseline_comparison"] = {
        "baseline_rubric_version": baseline.get("rubric_version"),
        "baseline_fingerprint": baseline.get("fingerprint"),
        "same_fingerprint": baseline.get("fingerprint") == result.get("fingerprint"),
        "baseline_score": baseline.get("score"),
        "score_delta": int(result.get("score", 0)) - int(baseline.get("score", 0)),
    }


def render_markdown(result: Dict[str, object]) -> str:
    lines = [
        "# Skill Evaluation Report",
        "",
        f"- Rubric version: `{result['rubric_version']}`",
        f"- Skill path: `{result['skill_path']}`",
        f"- Fingerprint: `{result['fingerprint']}`",
        f"- Score: **{result['score']}/100**",
        f"- Grade: **{result['grade']}**",
        f"- 通用评估: **{result['generic_assessment']['tag']}**",
        f"- 通用评估原因: {result['generic_assessment']['reason']}",
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

    baseline = result.get("baseline_comparison")
    if isinstance(baseline, dict):
        lines.extend(
            [
                "",
                "## Baseline Comparison",
                "",
                f"- Baseline rubric: `{baseline.get('baseline_rubric_version')}`",
                f"- Same fingerprint: `{baseline.get('same_fingerprint')}`",
                f"- Baseline score: `{baseline.get('baseline_score')}`",
                f"- Score delta: `{baseline.get('score_delta')}`",
            ]
        )

    failed = [check for check in result["checks"] if not check["passed"]]
    lines.extend(["", "## Failed Checks", ""])
    if not failed:
        lines.append("No failed checks.")
    else:
        lines.extend(["| ID | 检查项 | 维度 | 分值 | 说明 |", "| --- | --- | --- | ---: | --- |"])
        for check in failed:
            finding = str(check["result_message_zh"]).replace("|", "\\|")
            title = str(check["title_zh"]).replace("|", "\\|")
            category_name = str(check["category_name_zh"]).replace("|", "\\|")
            lines.append(
                f"| {check['id']} | {title} | {category_name} | {check['available']} | {finding} |"
            )

    return "\n".join(lines) + "\n"


def write_output(output: Optional[Path], content: str) -> None:
    if output is None:
        print(content, end="")
        return
    output.write_text(content, encoding="utf-8")


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Deterministically evaluate a Codex skill folder with the generic rubric."
    )
    parser.add_argument("skill_path", type=Path, help="Path to the skill folder to evaluate.")
    parser.add_argument(
        "--format",
        choices=["json", "md"],
        default="json",
        help="Output format. Defaults to json.",
    )
    parser.add_argument("--output", type=Path, help="Write report to this file instead of stdout.")
    parser.add_argument(
        "--baseline-json",
        type=Path,
        help="Optional previous JSON report for deterministic baseline comparison.",
    )
    return parser.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    if not args.skill_path.exists() or not args.skill_path.is_dir():
        print(f"error: skill path does not exist or is not a directory: {args.skill_path}", file=sys.stderr)
        return 2

    result = evaluate(args.skill_path)
    add_baseline_comparison(result, load_baseline(args.baseline_json))

    if args.format == "json":
        content = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    else:
        content = render_markdown(result)
    write_output(args.output, content)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
