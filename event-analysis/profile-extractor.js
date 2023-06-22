const fs = require('fs');

const times = [];
for (const fileName of process.argv.slice(2)) {
  // a .cpuprofile file
  const file = JSON.parse(fs.readFileSync(fileName, 'utf-8'));

  const nodes = new Map();
  for (const node of file.nodes) {
    nodes.set(node.id, node);
  }

  const reloadSignals = new Set();
  const addNodeToReloadSignals = (node) => {
    reloadSignals.add(node.id);
    for (const child of node.children) {
      addNodeToReloadSignals(nodes.get(child));
    }
  };

  const countedNodes = new Set();
  const addNodeToCounted = (node) => {
    if (node.callFrame?.functionName === 'deliver' || node.callFrame?.functionName === 'invoke') {
      return;
    }
    countedNodes.add(node.id);
    for (const child of node.children) {
      addNodeToCounted(nodes.get(child));
    }
  };

  for (const node of nodes.values()) {
    if (node.callFrame?.functionName === '___electron_webpack_init__') {
      addNodeToReloadSignals(node);
    }

    if (node.callFrame?.url.endsWith('vs/base/common/event.js')) {
      addNodeToCounted(node);
    }
  }

  let timeSinceReload = 0;
  let first = true;
  for (let i = 0; i < file.samples.length; i++) {
    const nodeId = file.samples[i];
    if (reloadSignals.has(nodeId) && timeSinceReload > 0) {
      if (!first) {
        times.push(timeSinceReload / 1000);
      } else {
        first = false; // only capture reload
      }
      timeSinceReload = 0;
    } else if (countedNodes.has(nodeId)) {
      timeSinceReload += file.timeDeltas[i];
    }
  }
}

console.log(times);
