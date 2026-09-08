import { createFileRoute } from "@tanstack/react-router";
import CultivationGame from "@/components/cultivation-game";

const title = "Soul Ascension — Tu Tiên Chi Lộ";
const description =
  "Hành trình tu luyện 2D: di chuyển, khai mở trắc nghiệm, tích lũy Tu Vi và đột phá 10 Cảnh Giới.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="h-dvh w-full overflow-hidden bg-ink">
      <CultivationGame />
    </main>
  );
}
