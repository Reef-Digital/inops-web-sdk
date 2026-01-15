export type { InopsClientOptions, Unsubscribe } from './client'
import { createInopsClient, subscribeToSessionSse } from './client'

export type { MountOptions } from './widget'
import { mount, unmount, scanAndMount } from './widget'

export { createInopsClient, subscribeToSessionSse, mount, unmount, scanAndMount }

// Browser global (for <script> usage)
declare global {
  interface Window {
    Inops?: any
    __INOPS_API_BASE_URL__?: string
  }
}

if (typeof window !== 'undefined') {
  window.Inops = {
    mount,
    unmount,
    scanAndMount,
    createInopsClient,
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scanAndMount())
  } else {
    scanAndMount()
  }
}


