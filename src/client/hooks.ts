import { useEffect, useState } from "react";
export function useMobile() {
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width:1023px)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(max-width:1023px)"),
      update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}
export function useViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    function update() {
      document.documentElement.style.setProperty(
        "--app-height",
        `${viewport?.height || innerHeight}px`,
      );
    }
    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);
}
export function useDraft(key: string, initial = "") {
  const read = () => {
    try {
      return sessionStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  };
  const [draft, setDraft] = useState(read);
  useEffect(() => {
    setDraft(read());
  }, [key]);
  function update(value: string) {
    setDraft(value);
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* In-memory editing remains available when browser storage is unavailable. */
    }
  }
  return [draft, update] as const;
}
