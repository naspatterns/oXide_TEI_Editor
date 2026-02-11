/**
 * Quick Action Prompt Templates
 *
 * Pre-defined prompts for common TEI tasks.
 */

import type { QuickAction } from '../types';

/** Available quick actions */
export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'explain-selection',
    label: '선택 설명',
    icon: '💡',
    description: '선택한 텍스트나 태그에 대해 설명합니다',
    prompt: '선택한 부분에 대해 설명해 주세요. 어떤 TEI 태그가 사용되었고, 각 태그의 역할은 무엇인가요?',
    requiresSelection: true,
  },
  {
    id: 'fix-errors',
    label: '오류 수정',
    icon: '🔧',
    description: '현재 문서의 검증 오류를 분석하고 수정 방법을 제안합니다',
    prompt: '현재 문서에 검증 오류가 있습니다. 각 오류의 원인을 분석하고 수정 방법을 제안해 주세요.',
    requiresSelection: false,
  },
  {
    id: 'generate-header',
    label: '헤더 생성',
    icon: '📋',
    description: 'teiHeader 메타데이터 템플릿을 생성합니다',
    prompt: '이 문서에 적합한 teiHeader를 생성해 주세요. titleStmt, publicationStmt, sourceDesc를 포함해 주세요.',
    requiresSelection: false,
  },
  {
    id: 'analyze-structure',
    label: '구조 분석',
    icon: '🔍',
    description: '문서 구조를 분석하고 개선점을 제안합니다',
    prompt: '이 TEI 문서의 구조를 분석해 주세요. 어떤 엘리먼트들이 사용되었고, 구조적으로 개선할 점이 있나요?',
    requiresSelection: false,
  },
];

/**
 * Get quick action by ID.
 */
export function getQuickAction(id: string): QuickAction | undefined {
  return QUICK_ACTIONS.find(action => action.id === id);
}

/**
 * Build a prompt with context for a quick action.
 */
export function buildQuickActionPrompt(
  action: QuickAction,
  selection?: string,
): string {
  let prompt = action.prompt;

  if (action.requiresSelection && selection) {
    prompt += `\n\n선택된 텍스트:\n\`\`\`xml\n${selection}\n\`\`\``;
  }

  return prompt;
}
