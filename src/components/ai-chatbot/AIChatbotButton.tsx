import { useEffect, useId, useRef, useState, type FormEvent, type MouseEventHandler } from "react"
import { sendChatMessage, type ChatHistoryMessage } from "./chatApi"
import "./AIChatbotButton.css"

interface AIChatbotButtonProps {
    onClick?: MouseEventHandler<HTMLButtonElement>
}

interface ChatMessage {
    id: number
    sender: "assistant" | "user"
    text: string
}

const initialMessages: ChatMessage[] = [
    {
        id: 1,
        sender: "assistant",
        text: "Hi! I'm Finaura AI. We can chat, or you can ask me about your finances.",
    },
]

function ChatIcon() {
    return (
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7.25 9.75A4.75 4.75 0 0 1 12 5h9a4.75 4.75 0 0 1 4.75 4.75v7.5A4.75 4.75 0 0 1 21 22h-6.6l-5.72 4.24c-.6.45-1.43.02-1.43-.73V9.75Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M12.25 13.75h.01M16.5 13.75h.01M20.75 13.75h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <path d="m23.5 3 .45 1.05L25 4.5l-1.05.45L23.5 6l-.45-1.05L22 4.5l1.05-.45L23.5 3Z" fill="currentColor" />
        </svg>
    )
}

export default function AIChatbotButton({ onClick }: AIChatbotButtonProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [draft, setDraft] = useState("")
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
    const [isSending, setIsSending] = useState(false)
    const [errorMessage, setErrorMessage] = useState("")
    const panelId = useId()
    const titleId = useId()
    const inputRef = useRef<HTMLInputElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const nextMessageId = useRef(initialMessages.length + 1)

    useEffect(() => {
        if (!isOpen) return
        inputRef.current?.focus()

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return
            setIsOpen(false)
            triggerRef.current?.focus()
        }

        document.addEventListener("keydown", closeOnEscape)
        return () => document.removeEventListener("keydown", closeOnEscape)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
    }, [errorMessage, isOpen, isSending, messages])

    const closeChat = () => {
        setIsOpen(false)
        requestAnimationFrame(() => triggerRef.current?.focus())
    }

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const message = draft.trim()
        if (!message || isSending) return

        const userMessage: ChatMessage = { id: nextMessageId.current++, sender: "user", text: message }
        const history: ChatHistoryMessage[] = messages.slice(1).map((item) => ({ role: item.sender, text: item.text }))
        setMessages((current) => [...current, userMessage])
        setDraft("")
        setErrorMessage("")
        setIsSending(true)

        try {
            const reply = await sendChatMessage(message, history)
            setMessages((current) => [...current, { id: nextMessageId.current++, sender: "assistant", text: reply }])
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Finaura AI is temporarily unavailable.")
        } finally {
            setIsSending(false)
        }
    }

    return (
        <div className={`ai-chatbot${isOpen ? " ai-chatbot--open" : ""}`}>
            {isOpen && (
                <section className="ai-chatbot-panel" id={panelId} role="dialog" aria-labelledby={titleId}>
                    <header className="ai-chatbot-panel__header">
                        <span className="ai-chatbot-panel__avatar" aria-hidden="true"><ChatIcon /></span>
                        <div className="ai-chatbot-panel__identity">
                            <h2 id={titleId}>Finaura AI</h2>
                            <p><span aria-hidden="true" /> AI assistant</p>
                        </div>
                        <button className="ai-chatbot-panel__close" type="button" aria-label="Close Finaura AI chatbot" onClick={closeChat}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                        </button>
                    </header>

                    <div className="ai-chatbot-panel__messages" aria-live="polite" aria-label="Chat messages">
                        <p className="ai-chatbot-panel__timestamp">Today</p>
                        {messages.map((message) => (
                            <div className={`ai-chatbot-message ai-chatbot-message--${message.sender}`} key={message.id}>
                                {message.sender === "assistant" && <span className="ai-chatbot-message__avatar" aria-hidden="true">AI</span>}
                                <p>{message.text}</p>
                            </div>
                        ))}
                        {isSending && (
                            <div className="ai-chatbot-message ai-chatbot-message--assistant" role="status" aria-label="Finaura AI is responding">
                                <span className="ai-chatbot-message__avatar" aria-hidden="true">AI</span>
                                <span className="ai-chatbot-typing" aria-hidden="true"><i /><i /><i /></span>
                            </div>
                        )}
                        {errorMessage && <p className="ai-chatbot-panel__error" role="alert">{errorMessage}</p>}
                        <div ref={messagesEndRef} />
                    </div>

                    <form className="ai-chatbot-composer" onSubmit={handleSubmit}>
                        <label className="ai-chatbot-composer__label" htmlFor={`${panelId}-input`}>Message Finaura AI</label>
                        <input
                            id={`${panelId}-input`}
                            ref={inputRef}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            placeholder="Message Finaura AI..."
                            autoComplete="off"
                            maxLength={1_200}
                            disabled={isSending}
                        />
                        <button type="submit" aria-label="Send message" disabled={!draft.trim() || isSending}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
                        </button>
                    </form>
                    <p className="ai-chatbot-panel__notice">Finaura AI can make mistakes and cannot see live weather. Verify important information.</p>
                </section>
            )}

            <button
                ref={triggerRef}
                className="ai-chatbot-button"
                type="button"
                aria-label={isOpen ? "Close Finaura AI chatbot" : "Open Finaura AI chatbot"}
                aria-expanded={isOpen}
                aria-controls={panelId}
                title={isOpen ? "Close Finaura AI chatbot" : "Open Finaura AI chatbot"}
                onClick={(event) => {
                    setIsOpen((current) => !current)
                    onClick?.(event)
                }}
            >
                <span className="ai-chatbot-button__icon" aria-hidden="true">
                    {isOpen
                        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                        : <ChatIcon />}
                </span>
                {!isOpen && <span className="ai-chatbot-button__tooltip" aria-hidden="true">Ask Finaura AI</span>}
            </button>
        </div>
    )
}
