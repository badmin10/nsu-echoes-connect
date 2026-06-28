import { createFileRoute, Link } from "@tanstack/react-router";
import { getProfileById, useAppState } from "@/lib/nsu-store";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/app/matches")({
  head: () => ({ meta: [{ title: "Matches — NSUMatch" }] }),
  component: Matches,
});

function Matches() {
  const [state] = useAppState();
  const matches = state.matches.map((id) => getProfileById(id)).filter(Boolean) as NonNullable<
    ReturnType<typeof getProfileById>
  >[];

  return (
    <div className="max-w-md mx-auto px-4 pt-6">
      <h1 className="text-2xl font-black tracking-tight">Matches</h1>
      <p className="text-xs text-muted-foreground">Say something nicer than "hey".</p>

      {matches.length === 0 ? (
        <div className="mt-12 text-center text-muted-foreground">
          <MessageCircle className="mx-auto h-10 w-10 opacity-50" />
          <p className="mt-3 text-sm">No matches yet. Keep swiping.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {matches.map((m) => {
            const lastMsg = state.messages[m.id]?.at(-1);
            return (
              <li key={m.id}>
                <Link
                  to="/app/chat/$id"
                  params={{ id: m.id }}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border hover:bg-accent transition"
                >
                  <img src={m.photo} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">
                        {m.firstName}, {m.age}
                      </p>
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {m.department}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {lastMsg ? lastMsg.text : "New match — start the conversation"}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
