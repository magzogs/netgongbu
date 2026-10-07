/**
 * Reasoning models served locally (qwen3, deepseek-r1, …) think aloud between <think> tags before
 * they answer. Splits that from the answer; `thinking` is true while the thought is still being
 * written.
 */
export function splitThinking(text: string): { answer: string; thinking: boolean } {
  let answer = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '');
  const open = answer.indexOf('<think>');
  const thinking = open >= 0;
  if (thinking) answer = answer.slice(0, open);
  return { answer: answer.trimStart(), thinking };
}
