export function SplashLoader({ label = "Loading your campus…" }: { label?: string }) {
  return (
    <div className="min-h-app h-full grid place-items-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-16 w-16 rounded-2xl nsu-gradient text-navy-foreground grid place-items-center text-2xl font-black animate-pulse-ring">
          N
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
