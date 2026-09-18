import { useId } from "react"
import "./FinauraLogo.css"

interface FinauraLogoProps {
    inverse?: boolean
    showTagline?: boolean
}

export function FinauraLogo({ inverse = false, showTagline = false }: FinauraLogoProps) {
    const gradientId = useId().replace(/:/g, "")

    return (
        <span className={`finaura-logo${inverse ? " finaura-logo-inverse" : ""}`}>
            <svg className="finaura-logo-symbol" viewBox="0 0 64 64" aria-hidden="true">
                <defs>
                    <linearGradient id={gradientId} x1="10" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#259566" />
                        <stop offset="1" stopColor="#0d5234" />
                    </linearGradient>
                </defs>
                <rect x="3" y="3" width="58" height="58" rx="18" fill={`url(#${gradientId})`} />
                <path d="M12 26c5-9 13-14 23-14 7 0 13 2 18 7" fill="none" stroke="#8ed1ab" strokeWidth="2" strokeLinecap="round" opacity=".52" />
                <circle cx="45.5" cy="18.5" r="5.5" fill="#f4cd73" />
                <path d="M17 45V36M27 45V30M37 45V25" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
                <path d="m16 34 10-8 9 4 13-12" fill="none" stroke="#f4cd73" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m42 18 6-.5-.5 6" fill="none" stroke="#f4cd73" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M18 51h28" stroke="#8ed1ab" strokeWidth="2" strokeLinecap="round" opacity=".7" />
            </svg>
            <span className="finaura-logo-copy">
                <strong>Finaura</strong>
                {showTagline && <small>Clarity for every peso</small>}
            </span>
        </span>
    )
}
