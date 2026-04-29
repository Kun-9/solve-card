import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={className ? `md ${className}` : "md"}>
      <ReactMarkdown
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          code({ className: codeClass, children: codeChildren, ...props }) {
            const isBlock =
              typeof codeClass === "string" &&
              (codeClass.includes("language-") || codeClass.includes("hljs"));
            const merged = `md-code ${isBlock ? "md-code-block" : "md-code-inline"}${
              codeClass ? ` ${codeClass}` : ""
            }`;
            return (
              <code className={merged} {...props}>
                {codeChildren}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
