import { describe, expect, it } from 'vitest'
import { takeoverVerdict } from '../dsh/index.js'

const llm = (models: any[]) => ({
  listProviders: () => [{ id: 'p1' }],
  listModels: async () => models,
})

describe('takeoverVerdict', () => {
  it('confirms a matching text-only model', async () => {
    expect(await takeoverVerdict(
      llm([{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', inputModalities: ['text'] }]),
      'DeepSeek V4 Flash'
    )).toBe(true)
  })

  it('vetoes when any matching model supports image', async () => {
    expect(await takeoverVerdict(
      llm([{ id: 'deepseek-vl', name: 'DeepSeek VL', inputModalities: ['text', 'image'] }]),
      'DeepSeek VL'
    )).toBe(false)
  })

  it('returns false when inputModalities is missing (unknown)', async () => {
    expect(await takeoverVerdict(
      llm([{ id: 'mystery-model', name: 'Mystery Model' }]),
      'Mystery Model'
    )).toBe(false)
  })

  it('returns false on empty label', async () => {
    expect(await takeoverVerdict(
      llm([{ id: 'x', name: 'X', inputModalities: ['text'] }]),
      ''
    )).toBe(false)
  })

  it('returns false when listModels throws', async () => {
    expect(await takeoverVerdict(
      { listProviders: () => [{ id: 'p1' }], listModels: async () => { throw new Error('boom') } },
      'Anything'
    )).toBe(false)
  })

  it('ignores modlens vision twins that reuse a text-only model id', async () => {
    const catalog: Record<string, any[]> = {
      siliconflow: [{ id: 'deepseek-ai/DeepSeek-V4-Pro', name: 'deepseek-ai/DeepSeek-V4-Pro', inputModalities: ['text'] }],
      'modlens-siliconflow': [{ id: 'deepseek-ai/DeepSeek-V4-Pro', name: 'deepseek-ai/DeepSeek-V4-Pro (modlens vision)', inputModalities: ['text', 'image'] }],
    }
    const host = { listProviders: () => Object.keys(catalog).map(id => ({ id })), listModels: async (id: string) => catalog[id] }
    expect(await takeoverVerdict(host, '选择模型，当前 deepseek-ai/DeepSeek-V4-Pro')).toBe(true)
    expect(await takeoverVerdict(host, '选择模型，当前 deepseek-ai/DeepSeek-V4-Pro (modlens vision)')).toBe(false)
  })

  it('returns false when no model matches the label', async () => {
    expect(await takeoverVerdict(
      llm([{ id: 'other', name: 'Other', inputModalities: ['text'] }]),
      'DeepSeek V4 Flash'
    )).toBe(false)
  })
})