export default function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11" : "h-8 w-8";
  const text = size === "lg" ? "text-xl" : "text-base";

  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`${box} inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]" aria-hidden>
          <path
            d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9 13h6M9 16.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <span className={`${text} font-semibold tracking-tight text-gray-900`}>SmartDocs</span>
    </span>
  );
}
