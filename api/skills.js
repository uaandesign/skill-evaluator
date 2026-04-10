/**
 * GET /api/skills - List all skills
 * POST /api/skills - Create a new skill
 * GET /api/skills/[id] - Get skill by ID
 * PUT /api/skills/[id] - Update skill
 * DELETE /api/skills/[id] - Delete skill
 */

import { initializePool } from '../lib/db.js';
import { Skills, SkillCategories, AuditLogs } from '../lib/db.js';

// Initialize DB pool
initializePool(process.env.DATABASE_URL);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { id } = req.query;

    // GET /api/skills - List all
    if (req.method === 'GET' && !id) {
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      const skills = await Skills.getAll(limit, offset);

      // Enrich with category names
      const enriched = await Promise.all(
        skills.map(async (skill) => {
          if (skill.category_id) {
            const cat = await SkillCategories.getById(skill.category_id);
            return { ...skill, category: cat?.category_key };
          }
          return skill;
        })
      );

      return res.status(200).json({ skills: enriched });
    }

    // GET /api/skills/[id] - Get by ID
    if (req.method === 'GET' && id) {
      const skill = await Skills.getById(id);
      if (!skill) return res.status(404).json({ error: '技能不存在' });

      if (skill.category_id) {
        const cat = await SkillCategories.getById(skill.category_id);
        skill.category = cat?.category_key;
      }

      return res.status(200).json(skill);
    }

    // POST /api/skills - Create
    if (req.method === 'POST') {
      const { name, description, skill_content, category, created_by } = req.body;

      if (!name || !skill_content) {
        return res.status(400).json({ error: '缺少必填字段: name, skill_content' });
      }

      let categoryId = null;
      if (category) {
        const cat = await SkillCategories.getByKey(category);
        if (cat) categoryId = cat.id;
      }

      const skill = await Skills.create({
        name,
        description,
        skillContent: skill_content,
        categoryId,
        createdBy: created_by || 'anonymous',
      });

      // Audit log
      await AuditLogs.create({
        userId: created_by || 'anonymous',
        action: 'CREATE_SKILL',
        entityType: 'skill',
        entityId: skill.id,
        changes: { name, category },
      });

      return res.status(201).json({ ...skill, category });
    }

    // PUT /api/skills/[id] - Update
    if (req.method === 'PUT' && id) {
      const { name, description, skill_content, category, version, version_count } = req.body;

      let categoryId = null;
      if (category) {
        const cat = await SkillCategories.getByKey(category);
        if (cat) categoryId = cat.id;
      }

      const skill = await Skills.update(id, {
        name,
        description,
        skillContent: skill_content,
        categoryId,
        version,
        versionCount: version_count,
      });

      if (!skill) return res.status(404).json({ error: '技能不存在' });

      // Audit log
      await AuditLogs.create({
        userId: req.body.user_id || 'anonymous',
        action: 'UPDATE_SKILL',
        entityType: 'skill',
        entityId: id,
        changes: { name, description, category, version },
      });

      return res.status(200).json({ ...skill, category });
    }

    // DELETE /api/skills/[id]
    if (req.method === 'DELETE' && id) {
      const skill = await Skills.delete(id);
      if (!skill) return res.status(404).json({ error: '技能不存在' });

      // Audit log
      await AuditLogs.create({
        userId: req.body?.user_id || 'anonymous',
        action: 'DELETE_SKILL',
        entityType: 'skill',
        entityId: id,
        changes: {},
      });

      return res.status(200).json({ success: true, id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[Skills API Error]', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}
