import { Component, type ErrorInfo, type ReactNode } from "react";
import Atlas from "./Atlas";

class AppBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Pose Atlas render failed", error, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <div className="mx-auto max-w-xl p-10 text-center">
        <h1 className="text-2xl">页面暂时无法显示</h1>
        <p className="my-5 text-sm text-muted">
          请刷新后重试。已保存的本机资料仍保留在浏览器中。
        </p>
        <button onClick={() => location.reload()}>刷新页面</button>
      </div>
    ) : (
      this.props.children
    );
  }
}

export default function App() {
  const match = location.pathname.match(/^\/share\/([a-zA-Z0-9_-]+)\/?$/);
  if (location.pathname !== "/" && !match)
    return (
      <div className="p-12 text-center">
        <h1 className="mb-5 text-3xl">页面不存在</h1>
        <a href="/">返回姿势图鉴 →</a>
      </div>
    );
  return (
    <AppBoundary>
      <Atlas shareId={match?.[1]} />
    </AppBoundary>
  );
}
