import Clear from './Clear'
import History from './History'

export const actionMap = {
    clear: Clear,
    history: History,
} as const

type ActionMap = typeof actionMap

export type ActionKeys = keyof ActionMap

type getActionList = (mobile?: boolean) => ActionKeys[]

// we can make these action lists configurable in the future
export const getLeftActionList: getActionList = (mobile) =>
    ['model', 'fileUpload', 'temperature', 'history', !mobile && 'stt', 'tools', 'token'].filter(
        Boolean
    ) as ActionKeys[]

export const getRightActionList: getActionList = () => ['clear'].filter(Boolean) as ActionKeys[]
