# 🧪 Skill Evaluator Module - Setup & Deployment Guide

## Overview

The **Skill Evaluator Module** has been integrated into your Skill Evaluator platform. This module provides comprehensive skill evaluation using the skill-evaluator-mvp framework with Claude's evaluation capabilities.

## What's New

### New Component: "🧪 技能评估" (Skill Evaluation)
- Located in the main navigation menu
- Provides a user-friendly interface for evaluating AI skills
- Generates comprehensive evaluation reports with scores and recommendations
- Integrated with Claude API for intelligent analysis

## File Changes

### Frontend Components
- **`src/components/SkillEvaluatorModule.jsx`** (NEW)
  - React component with tabbed interface (Input & Results)
  - Supports SKILL.md upload and test case input
  - Displays evaluation results with dimensional scores
  - Shows weakness analysis and optimization suggestions

### Updated Files
- **`src/App.jsx`** - Added new menu item and route
  - Line 7: Import SkillEvaluatorModule
  - Line 22: Added menu item for skill-evaluator tab
  - Line 30: Added case for rendering SkillEvaluatorModule

### Backend
- **`server.js`** (UPDATED)
  - NEW ENDPOINT: `POST /api/evaluate-skill`
  - Accepts skill_content (SKILL.md) and test_cases (JSON)
  - Returns structured evaluation report
  - Requires ANTHROPIC_API_KEY for Claude API access

## Prerequisites

### 1. Environment Variables
Create or update `.env` file in project root:

```bash
# Claude API Configuration
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx

# Optional: Custom API base URL
# ANTHROPIC_API_BASE_URL=https://api.anthropic.com

# Server Port (default: 3001)
PORT=3001
```

### 2. Dependencies
All required dependencies are already in `package.json`:
- `react` 18.3.0
- `express` 4.18.2
- `antd` 5.16.0
- `recharts` 2.12.0
- `zustand` 4.5.0

Install if needed:
```bash
npm install
```

## Getting Started

### Option 1: Development Mode (Recommended)

```bash
# Navigate to project directory
cd /sessions/quirky-peaceful-pascal/mnt/Claudework/skill-evaluator

# Install dependencies (if not already done)
npm install

# Start both frontend and backend in development mode
npm run dev
```

This will:
- Start the **Express backend** on `http://localhost:3001`
- Start the **React frontend** on `http://localhost:5173`

### Option 2: Production Build

```bash
# Build the project
npm run build

# Start the production server
node server.js
```

Server will run on `http://localhost:3001`

## How to Use the Skill Evaluator Module

### Step 1: Access the Module
1. Open the platform (http://localhost:5173 or http://localhost:3001)
2. Click on **"🧪 技能评估"** in the left sidebar menu
3. You'll see the "📝 Skill Input" tab

### Step 2: Provide Skill Information

**Method A: Upload Files**
- Click "Upload File" for SKILL.md
- Click "Upload File" for Test Cases
- Files will auto-populate the text areas

**Method B: Paste Content**
- Paste your SKILL.md content directly into the left textarea
- Paste test cases JSON into the right textarea

### Example Test Cases Format

```json
{
  "test_cases": [
    {
      "id": "1",
      "name": "Basic functionality test",
      "input": "User input or query",
      "expected_output": "What the skill should produce",
      "test_type": "quality"
    },
    {
      "id": "2",
      "name": "Edge case test",
      "input": "Edge case input",
      "expected_output": "Expected handling of edge case",
      "test_type": "edge_case"
    }
  ]
}
```

### Step 3: Execute Evaluation
- Click the **"Execute Evaluation"** button
- Wait for the evaluation to complete (typically 30-60 seconds)
- The system will automatically switch to the "📊 Evaluation Results" tab

### Step 4: Review Results
The evaluation report includes:

**Summary Cards**
- Overall Score (0-100)
- Tests Passed / Total
- Pass Rate (%)
- Quality Grade (A/B/C)

**Dimensional Scores**
- Coherence (structure and logic)
- Fluency (readability and language)
- Relevance (alignment with intent)
- Accuracy (correctness)
- Completeness (thoroughness)

**Detailed Test Results**
- Per-test status (Pass/Fail)
- Individual dimensional scores
- Evidence and notes for each test

**Weakness Analysis**
- Lowest scoring dimension
- Common failure patterns
- Systemic issues identified

**Optimization Suggestions**
- High/Medium/Low priority recommendations
- Specific actions to improve each weak area
- Expected score improvements

## API Reference

### Evaluate Skill Endpoint

**Endpoint:** `POST /api/evaluate-skill`

**Request Body:**
```json
{
  "skill_content": "# SKILL.md content...",
  "test_cases": {
    "test_cases": [
      {
        "id": "1",
        "name": "Test name",
        "input": "Input text",
        "expected_output": "Expected output",
        "test_type": "quality"
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "overall_score": 75,
    "test_results": {
      "total_tests": 3,
      "passed": 2,
      "failed": 1,
      "pass_rate": 66.7
    }
  },
  "dimensional_scores": {
    "coherence": 4.2,
    "fluency": 4.1,
    "relevance": 3.8,
    "accuracy": 3.5,
    "completeness": 3.2
  },
  "detailed_results": [...],
  "weakness_analysis": {...},
  "optimization_suggestions": [...]
}
```

## Troubleshooting

### Issue: "Claude API key not configured"
**Solution:**
- Add `ANTHROPIC_API_KEY` to `.env` file
- Restart the server
- Verify API key is valid at https://console.anthropic.com

### Issue: "Evaluation failed" error
**Solution:**
- Check that SKILL.md content is properly formatted
- Verify test cases JSON is valid (use JSONLint)
- Check server logs for detailed error message
- Ensure API key has sufficient credits

### Issue: Frontend won't start
**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Issue: Port already in use
**Solution:**
```bash
# Kill process on port 3001 (Linux/Mac)
lsof -ti:3001 | xargs kill -9

# Or specify different port
PORT=3002 npm run dev:server
```

## Configuration

### Customize Claude Model
Edit `server.js` line where it calls Claude API:

```javascript
// Change from:
model: 'claude-opus-4-1',

// To:
model: 'claude-opus-4-1-20250514', // Or latest available
```

### Adjust Response Token Limit
In `server.js`:

```javascript
max_tokens: 4000, // Increase if evaluations are incomplete
```

## Performance Notes

- **Average evaluation time**: 30-60 seconds
- **Token usage**: ~800-1200 tokens per evaluation
- **Estimated cost**: ~$0.01-0.02 per evaluation
- **Concurrent requests**: Limited by API rate limits

## Future Enhancements

### Phase 2 Features (Coming Soon)
- [ ] Multi-model evaluation (test with OpenAI, Gemini, etc.)
- [ ] RAG-specific evaluators (faithfulness, context relevance)
- [ ] Batch evaluation of multiple skills
- [ ] Evaluation history and comparison
- [ ] Export results to PDF/Excel
- [ ] One-click optimization suggestions application
- [ ] Integration with skill marketplace

### Phase 3 Features (Planned)
- [ ] Automated skill optimization engine
- [ ] Performance monitoring dashboard
- [ ] Team collaboration features
- [ ] Custom evaluation criteria
- [ ] A/B testing framework

## Support

### Getting Help
1. Check this guide for common issues
2. Review Claude API documentation: https://docs.anthropic.com
3. Check server logs: `npm run dev:server` shows console output
4. Verify .env configuration

### Reporting Issues
- Check the server console for error messages
- Review browser console (F12 DevTools)
- Include error message and evaluation content in reports

## Summary

Your Skill Evaluator platform now has a powerful evaluation module that:
✅ Accepts skill definitions and test cases
✅ Performs comprehensive multi-dimensional evaluation
✅ Generates actionable optimization suggestions
✅ Provides detailed performance metrics
✅ Integrates seamlessly with your existing platform

**Start evaluating skills now!** Navigate to the "🧪 技能评估" tab in your platform.
