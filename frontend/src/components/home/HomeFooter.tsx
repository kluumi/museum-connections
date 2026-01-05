// HomeFooter - Footer component for the home page

export function HomeFooter() {
  return (
    <footer className="border-t bg-card/30">
      <div className="container mx-auto px-6 py-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Installation interactive Nantes — Paris
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>WebRTC P2P</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
            <span>React + TypeScript</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
            <span>TailwindCSS</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
