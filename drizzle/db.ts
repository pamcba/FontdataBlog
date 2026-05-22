import postgres from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined
  // eslint-disable-next-line no-var
  var _drizzleDb: PostgresJsDatabase<typeof schema> | undefined
}

function getDb(): PostgresJsDatabase<typeof schema> {
  if (global._drizzleDb) return global._drizzleDb

  const client =
    global._pgClient ??
    postgres(process.env.DATABASE_URL!, {
      ssl: { rejectUnauthorized: false },
      max: 5,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 30,
      max_lifetime: 60 * 10,
    })

  if (process.env.NODE_ENV !== 'production') {
    global._pgClient = client
  }

  const instance = drizzle(client, { schema })

  if (process.env.NODE_ENV !== 'production') {
    global._drizzleDb = instance
  }

  return instance
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    return getDb()[prop as keyof PostgresJsDatabase<typeof schema>]
  },
})

export const client = new Proxy({} as ReturnType<typeof postgres>, {
  get(_target, prop) {
    // ensure getDb() has been called so global._pgClient is set
    getDb()
    return global._pgClient![prop as keyof ReturnType<typeof postgres>]
  },
})
