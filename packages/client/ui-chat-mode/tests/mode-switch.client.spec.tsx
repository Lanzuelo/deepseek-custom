// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ModeSwitch, type ModeSwitchProps } from '../src/client/ModeSwitch.tsx'
import { zh } from '../src/client/locales.ts'
import type { ChatMode } from '../src/client/mode.ts'

afterEach(cleanup)

const t: ModeSwitchProps['t'] = makeTranslate(zh)

function renderSwitch(mode: ChatMode, setMode = vi.fn()) {
  return render(
    <ModeSwitch useMode={selector => selector(mode)} setMode={setMode} t={t} />,
  )
}

describe('ModeSwitch', () => {
  it('shows the remembered mode and offers exactly two choices', () => {
    renderSwitch('agent')
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['智能体', '聊天'])
    expect(screen.getByRole('tab', { name: '智能体' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tablist', { name: '模式' })).toBeTruthy()
  })

  it('reports the chosen mode without changing local state itself', async () => {
    const setMode = vi.fn()
    renderSwitch('agent', setMode)
    screen.getByRole('tab', { name: '聊天' }).click()
    expect(setMode).toHaveBeenCalledWith('chat')
  })
})
