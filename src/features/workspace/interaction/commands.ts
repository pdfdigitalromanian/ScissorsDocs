export interface Command {
  id: string
  label: string
  execute: () => void
}

/**
 * CommandRegistry is the command execution structure of the workspace.
 * Tools and shortcuts execute named commands instead of reaching into
 * component state, so behavior can be rebound without touching callers.
 */
export class CommandRegistry {
  private commands = new Map<string, Command>()

  register(command: Command): () => void {
    this.commands.set(command.id, command)
    return () => this.unregister(command.id)
  }

  unregister(id: string): void {
    this.commands.delete(id)
  }

  has(id: string): boolean {
    return this.commands.has(id)
  }

  get(id: string): Command | undefined {
    return this.commands.get(id)
  }

  execute(id: string): boolean {
    const command = this.commands.get(id)
    if (!command) return false
    command.execute()
    return true
  }

  list(): Command[] {
    return Array.from(this.commands.values())
  }
}

export function createCommandRegistry(): CommandRegistry {
  return new CommandRegistry()
}
