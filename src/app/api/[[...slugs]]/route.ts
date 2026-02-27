import { Elysia, t } from 'elysia'

const api = new Elysia({ prefix: '/api' })   // match the folder name
  .get('/', ' Hello from Elysia inside Next.js')
  .post('/', ({ body }) => body, {
    body: t.Object({ name: t.String() })
  })

export const GET  = api.fetch  
export const POST = api.fetch