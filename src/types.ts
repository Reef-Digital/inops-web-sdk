export type InopsUserInput =
  | { type: 'search'; value: string }
  | { type: 'campaignId'; campaignId: string }

export type InopsFlowRequest = {
  userInput: InopsUserInput
  shopConfigId?: string
  sessionId?: string
  language?: string
  referenceId?: string
}

export type InopsWidget =
  | { type: 'text'; text?: string; value?: string }
  | { type: 'product'; productId: string; title?: string; score?: number; metadata?: any }
  | Record<string, any>

export type InopsFlowResponseEnvelope = {
  duration?: number
  request?: string
  response?: {
    widgets?: InopsWidget[]
    [k: string]: any
  }
  meta?: any
  status?: string
  // Some endpoints wrap this under data for streaming
  data?: any
  [k: string]: any
}

export type InopsFlowStartResponse = { sessionId?: string; [k: string]: any }

export type InopsProduct = {
  type: 'product'
  productId: string
  title?: string
  [k: string]: any
}

export type InopsSearchResult = {
  sessionId?: string
  summary?: string
  products: InopsProduct[]
  raw?: any
}


