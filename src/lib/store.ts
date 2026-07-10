import { create } from 'zustand'

export interface SystemState {
  alertLevel: number
  breached: Set<string>
  activeNode: string | null
  bootComplete: boolean
  mode: 'guided' | 'terminal'
  currentLayer: number
  cinematicMode: boolean
  selectedRole: 'builder' | 'breaker' | null
  descentUnlocked: boolean
  choicePhase: 'locked' | 'pending' | 'chosen'
  // Layer 1 overlay state (drives DOM sibling outside Canvas)
  l1Status: 'idle' | 'running' | 'done'
  l1LogText: string
  l1ShowResume: boolean
  // Actions
  setAlertLevel: (n: number) => void
  raiseAlert: (delta: number) => void
  breachNode: (id: string) => void
  setActiveNode: (id: string | null) => void
  setBootComplete: (v: boolean) => void
  setMode: (m: 'guided' | 'terminal') => void
  setCurrentLayer: (n: number) => void
  setCinematicMode: (v: boolean) => void
  setSelectedRole: (r: 'builder' | 'breaker' | null) => void
  setDescentUnlocked: (v: boolean) => void
  setChoicePhase: (p: 'locked' | 'pending' | 'chosen') => void
  setL1Status: (s: 'idle' | 'running' | 'done') => void
  setL1LogText: (t: string) => void
  setL1ShowResume: (v: boolean) => void
  reset: () => void

}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

const defaults = {
  alertLevel: 0,
  breached: new Set<string>(),
  activeNode: null as string | null,
  bootComplete: false,
  mode: 'guided' as const,
  currentLayer: 0,
  cinematicMode: false,
  selectedRole: null as 'builder' | 'breaker' | null,
  descentUnlocked: false,
  choicePhase: 'locked' as 'locked' | 'pending' | 'chosen',
  l1Status: 'idle' as 'idle' | 'running' | 'done',
  l1LogText: '[ SYSTEM IDLE ]',
  l1ShowResume: false,
}

export const useSystemStore = create<SystemState>((set, get) => ({
  ...defaults,

  setAlertLevel: (n) => set({ alertLevel: clamp01(n) }),

  raiseAlert: (delta) => set({ alertLevel: clamp01(get().alertLevel + delta) }),

  // Returns a new Set — never mutates in-place; also bumps alertLevel
  breachNode: (id) => {
    if (get().breached.has(id)) return
    set((s) => ({
      breached: new Set([...s.breached, id]),
      alertLevel: clamp01(s.alertLevel + 0.2),
    }))
  },

  setActiveNode: (id) => set({ activeNode: id }),
  setBootComplete: (v) => set({ bootComplete: v }),
  setMode: (m) => set({ mode: m }),
  setCurrentLayer: (n) => set({ currentLayer: n }),
  setCinematicMode: (v) => set({ cinematicMode: v }),
  setSelectedRole: (r) => set({ selectedRole: r }),
  setDescentUnlocked: (v) => set({ descentUnlocked: v }),
  setChoicePhase: (p) => set({ choicePhase: p }),
  setL1Status: (s) => set({ l1Status: s }),
  setL1LogText: (t) => set({ l1LogText: t }),
  setL1ShowResume: (v) => set({ l1ShowResume: v }),

  reset: () => set({ ...defaults, breached: new Set<string>() }),
}))
