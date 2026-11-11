export type Id = string

export interface Criterion {
  id: Id
  name: string
  weight: number
  position: number
}

export interface Team {
  id: Id
  name: string
  pitchOrder: number
  noShow: boolean
  manualTiebreak: number | null
}

export interface Score {
  teamId: Id
  criterionId: Id
  jurorId: Id
  value: number
}
