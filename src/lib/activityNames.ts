/** Use only unambiguous, identity-verified references; never guess missing letters. */
export function resolveActivityNames<T extends { pessoa: string | null; detalhe: string | null }>(
  items: T[], references: { corrupted_name: string; reference_name: string }[],
): T[] {
  const candidates = new Map<string, Set<string>>();
  for (const ref of references) {
    if (!ref.corrupted_name.includes("\uFFFD") || !ref.reference_name || ref.reference_name.includes("\uFFFD")) continue;
    const options = candidates.get(ref.corrupted_name) ?? new Set<string>();
    options.add(ref.reference_name);
    candidates.set(ref.corrupted_name, options);
  }
  return items.map((item) => {
    let pessoa = item.pessoa;
    let detalhe = item.detalhe;
    for (const [broken, options] of candidates) {
      if (options.size !== 1) continue;
      const [name] = options;
      if (!name) continue;
      if (pessoa === broken) pessoa = name;
      if (detalhe?.includes(broken)) detalhe = detalhe.split(broken).join(name);
    }
    return { ...item, pessoa, detalhe };
  });
}