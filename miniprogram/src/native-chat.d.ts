import type { DetailedHTMLProps, HTMLAttributes } from 'react'

interface NativeChatEvent<T> { detail: T }

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      't-chat-message': Omit<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, 'content'> & {
        'chat-id': string
        role: 'user' | 'assistant'
        placement: 'left' | 'right'
        name: string
        variant: 'base'
        status: 'pending' | 'complete'
        animation: 'dots'
        content: Array<{ type: string; data: unknown }>
      }
      't-chat-sender': Omit<DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>, 'onChange' | 'onBlur'> & {
        value: string
        disabled: boolean
        placeholder: string
        'render-presets': Array<{ name: 'send'; type: 'icon' }>
        'textarea-props': { autosize: { minHeight: number; maxHeight: number } }
        'adjust-position': boolean
        'auto-rise-with-keyboard': boolean
        onChange: (event: NativeChatEvent<{ value: string }>) => void
        onSend: (event: NativeChatEvent<{ value: string }>) => void
        onKeyboardheightchange: (event: NativeChatEvent<{ height: number }>) => void
        onBlur: () => void
      }
    }
  }
}
