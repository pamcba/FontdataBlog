import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'
import { getAppUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'

export async function GET() {
  const baseUrl = getAppUrl()
  const settings = await getSettings()
  const blogName = settings.company.blog_name || process.env.NEXT_PUBLIC_BLOG_NAME || 'Blog'

  const spec = {
    openapi: '3.1.0',
    info: {
      title: `${blogName} API`,
      description: `API pública para integração com o ${blogName}. Permite gerenciar postagens, categorias e tags de forma programática.`,
      version: '1.0.0',
      contact: {
        name: blogName,
      },
    },
    servers: [
      { url: `${baseUrl}/api/v1`, description: 'Servidor atual' },
    ],
    components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token de API gerado pelo painel administrativo em /admin/api',
      },
    },
    schemas: {
      Post: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          title: { type: 'string', example: 'Introdução ao TypeScript' },
          slug: { type: 'string', example: 'introducao-ao-typescript' },
          content: { type: 'string', example: '<p>Conteúdo do post em HTML</p>' },
          excerpt: { type: 'string', example: 'Resumo do post' },
          cover_image: { type: 'string', nullable: true, example: 'https://example.com/image.jpg' },
          status: { type: 'string', enum: ['draft', 'published'], example: 'published' },
          published_at: { type: 'string', nullable: true, format: 'date-time' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      PostWithRelations: {
        allOf: [
          { $ref: '#/components/schemas/Post' },
          {
            type: 'object',
            properties: {
              categories: {
                type: 'array',
                items: { $ref: '#/components/schemas/Category' },
              },
              tags: {
                type: 'array',
                items: { $ref: '#/components/schemas/Tag' },
              },
            },
          },
        ],
      },
      PostInput: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', example: 'Novo Post' },
          slug: { type: 'string', description: 'Gerado automaticamente a partir do título se não informado' },
          content: { type: 'string', default: '', example: '<p>Conteúdo HTML do post</p>' },
          excerpt: { type: 'string', default: '', example: 'Resumo do post' },
          cover_image: { type: 'string', nullable: true, example: 'https://example.com/image.jpg' },
          status: { type: 'string', enum: ['draft', 'published'], default: 'draft' },
          category_ids: { type: 'array', items: { type: 'integer' }, example: [1, 2] },
          tag_ids: { type: 'array', items: { type: 'integer' }, example: [1] },
        },
      },
      PostUpdate: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          slug: { type: 'string' },
          content: { type: 'string' },
          excerpt: { type: 'string' },
          cover_image: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['draft', 'published'] },
          category_ids: { type: 'array', items: { type: 'integer' } },
          tag_ids: { type: 'array', items: { type: 'integer' } },
        },
      },
      Category: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Tecnologia' },
          slug: { type: 'string', example: 'tecnologia' },
          description: { type: 'string', nullable: true, example: 'Artigos sobre tecnologia' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      CategoryInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'Tecnologia' },
          slug: { type: 'string', description: 'Gerado automaticamente se não informado' },
          description: { type: 'string', example: 'Artigos sobre tecnologia' },
        },
      },
      CategoryUpdate: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string', nullable: true },
        },
      },
      Tag: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'JavaScript' },
          slug: { type: 'string', example: 'javascript' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      TagInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'JavaScript' },
          slug: { type: 'string', description: 'Gerado automaticamente se não informado' },
        },
      },
      TagUpdate: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          slug: { type: 'string' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    '/posts': {
      get: {
        summary: 'Listar posts',
        description: 'Retorna uma lista paginada de posts. Por padrão retorna apenas posts publicados.',
        tags: ['Posts'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Número da página' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 50 }, description: 'Itens por página' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published', 'all'], default: 'published' }, description: 'Filtrar por status' },
        ],
        responses: {
          '200': {
            description: 'Lista de posts',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    posts: { type: 'array', items: { $ref: '#/components/schemas/Post' } },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Criar post',
        description: 'Cria um novo post no blog. O slug é gerado automaticamente a partir do título se não for informado. O conteúdo HTML é sanitizado no servidor.',
        tags: ['Posts'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PostInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Post criado com sucesso',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { post: { $ref: '#/components/schemas/Post' } },
                },
              },
            },
          },
          '400': { description: 'Dados inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'Slug já existe', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/posts/{id}': {
      get: {
        summary: 'Obter post por ID',
        description: 'Retorna os detalhes de um post específico, incluindo suas categorias e tags associadas.',
        tags: ['Posts'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID do post' },
        ],
        responses: {
          '200': {
            description: 'Detalhes do post',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { post: { $ref: '#/components/schemas/PostWithRelations' } },
                },
              },
            },
          },
          '404': { description: 'Post não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      put: {
        summary: 'Atualizar post',
        description: 'Atualiza os dados de um post existente. Ao publicar um post pela primeira vez, o campo published_at é definido automaticamente.',
        tags: ['Posts'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID do post' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PostUpdate' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Post atualizado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { post: { $ref: '#/components/schemas/Post' } },
                },
              },
            },
          },
          '404': { description: 'Post não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        summary: 'Excluir post',
        description: 'Remove um post permanentemente. Categorias e tags associadas também são removidas.',
        tags: ['Posts'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID do post' },
        ],
        responses: {
          '200': {
            description: 'Post excluído',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } },
          },
          '404': { description: 'Post não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/categories': {
      get: {
        summary: 'Listar categorias',
        description: 'Retorna todas as categorias ordenadas por nome.',
        tags: ['Categorias'],
        responses: {
          '200': {
            description: 'Lista de categorias',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { categories: { type: 'array', items: { $ref: '#/components/schemas/Category' } } },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Criar categoria',
        description: 'Cria uma nova categoria. O slug é gerado automaticamente a partir do nome se não for informado.',
        tags: ['Categorias'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CategoryInput' } } },
        },
        responses: {
          '201': {
            description: 'Categoria criada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { category: { $ref: '#/components/schemas/Category' } },
                },
              },
            },
          },
          '409': { description: 'Categoria já existe', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/categories/{id}': {
      get: {
        summary: 'Obter categoria por ID',
        tags: ['Categorias'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID da categoria' },
        ],
        responses: {
          '200': {
            description: 'Detalhes da categoria',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { category: { $ref: '#/components/schemas/Category' } },
                },
              },
            },
          },
          '404': { description: 'Categoria não encontrada' },
        },
      },
      put: {
        summary: 'Atualizar categoria',
        tags: ['Categorias'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID da categoria' },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CategoryUpdate' } } },
        },
        responses: {
          '200': {
            description: 'Categoria atualizada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { category: { $ref: '#/components/schemas/Category' } },
                },
              },
            },
          },
          '404': { description: 'Categoria não encontrada' },
        },
      },
      delete: {
        summary: 'Excluir categoria',
        description: 'Remove uma categoria. Não é possível excluir categorias que possuem posts associados.',
        tags: ['Categorias'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID da categoria' },
        ],
        responses: {
          '200': {
            description: 'Categoria excluída',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } },
          },
          '409': { description: 'Categoria possui posts associados' },
        },
      },
    },
    '/tags': {
      get: {
        summary: 'Listar tags',
        description: 'Retorna todas as tags ordenadas por nome.',
        tags: ['Tags'],
        responses: {
          '200': {
            description: 'Lista de tags',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } } },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Criar tag',
        description: 'Cria uma nova tag. O slug é gerado automaticamente a partir do nome se não for informado.',
        tags: ['Tags'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TagInput' } } },
        },
        responses: {
          '201': {
            description: 'Tag criada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { tag: { $ref: '#/components/schemas/Tag' } },
                },
              },
            },
          },
          '409': { description: 'Tag já existe', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/tags/{id}': {
      get: {
        summary: 'Obter tag por ID',
        tags: ['Tags'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID da tag' },
        ],
        responses: {
          '200': {
            description: 'Detalhes da tag',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { tag: { $ref: '#/components/schemas/Tag' } },
                },
              },
            },
          },
          '404': { description: 'Tag não encontrada' },
        },
      },
      put: {
        summary: 'Atualizar tag',
        tags: ['Tags'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID da tag' },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TagUpdate' } } },
        },
        responses: {
          '200': {
            description: 'Tag atualizada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { tag: { $ref: '#/components/schemas/Tag' } },
                },
              },
            },
          },
          '404': { description: 'Tag não encontrada' },
        },
      },
      delete: {
        summary: 'Excluir tag',
        description: 'Remove uma tag permanentemente.',
        tags: ['Tags'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID da tag' },
        ],
        responses: {
          '200': {
            description: 'Tag excluída',
            content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } },
          },
          '404': { description: 'Tag não encontrada' },
        },
      },
    },
  },
  }

  return NextResponse.json(spec)
}
