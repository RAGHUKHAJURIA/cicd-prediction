export const logger = {
  info: (data: Record<string, unknown>, message?: string) => {
    console.log(JSON.stringify({ level: 'info', msg: message, ...data }))
  },
  error: (data: Record<string, unknown>, message?: string) => {
    console.error(JSON.stringify({ level: 'error', msg: message, ...data }))
  },
  warn: (data: Record<string, unknown>, message?: string) => {
    console.warn(JSON.stringify({ level: 'warn', msg: message, ...data }))
  }
}
