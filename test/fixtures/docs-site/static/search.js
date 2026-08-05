(() => {
  const input = document.getElementById("searchBox");
  const results = document.getElementById("searchResults");
  if (!input || !results) return;

  /** @type {{ title: string; url: string; mount: string; text: string }[] | null} */
  let index = null;

  const ensureIndex = async () => {
    if (index) return index;
    const res = await fetch("/search.json", { cache: "no-store" });
    if (!res.ok) return [];
    index = await res.json();
    return index;
  };

  const renderResults = (items) => {
    if (!items || items.length === 0) {
      results.style.display = "none";
      results.innerHTML = "";
      return;
    }
    results.style.display = "block";
    results.innerHTML = items
      .slice(0, 12)
      .map((x) => `<a href="${x.url}">${x.title} <span style="opacity:.65">(${x.mount})</span></a>`)
      .join("");
  };

  const query = async (q) => {
    const text = q.trim().toLowerCase();
    if (text.length < 2) return [];
    const data = await ensureIndex();
    return data.filter((d) => {
      const hay = `${d.title} ${d.text}`.toLowerCase();
      return hay.includes(text);
    });
  };

  input.addEventListener("input", async () => {
    const items = await query(input.value);
    renderResults(items);
  });

  document.addEventListener("click", (e) => {
    if (e.target === input || results.contains(e.target)) return;
    results.style.display = "none";
  });
})();

