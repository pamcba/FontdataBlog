// lib/source-crawlers/types.ts

export type CrawlerType = 'github' | 'docs' | 'custom'

export interface CrawlerCandidate {
  key: string
  title: string
  content: string
  url: string
}

export interface CrawlerHandlerOptions {
  url: string
  prompt: string
  alreadyProcessedKeys: string[]
}

export interface CrawlerHandlerResult {
  chosen: CrawlerCandidate
}
