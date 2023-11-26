type Tree = Record<string, string[]>;

function validateDependency(tree: Tree, key: string) {
  if (!tree[key]) {
    throw new Error(`Missing dependency: ${key}`);
  }
}

function validateTree(tree: Tree) {
  for (const key in tree) {
    for (const dependency of tree[key]) {
      validateDependency(tree, dependency);
    }
  }
}

export function resolveNode(
  tree: Tree,
  chain: string[],
  key: string,
  resolved: string[],
) {
  if (resolved.indexOf(key) !== resolved.lastIndexOf(key)) {
    throw new Error(`Circular dependency found: ${resolved.join(" > ")}`);
  }

  if (tree[key] != null) {
    tree[key].forEach(function (depender) {
      resolveNode(tree, chain, depender, resolved.concat(depender));
    });
  }

  if (!chain.includes(key)) {
    chain.push(key);
    delete tree[key];
  }
}

export function resolveTree(tree: Tree) {
  const chain: string[] = [];

  tree = { ...tree };

  validateTree(tree);

  for (const node of Object.keys(tree)) {
    resolveNode(tree, chain, node, [node]);
  }

  return chain;
}
