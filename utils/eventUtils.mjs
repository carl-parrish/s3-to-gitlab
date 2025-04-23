// Copyright 2025 Deeply Digital Designs Inc. 
// Licensed under the GPL 3.0 License - see LICENSE file for details.

export const getEventCategory = (eventName) => {
  if (eventName.startsWith('ObjectCreated:')) return 'create';
  if (eventName.startsWith('ObjectRemoved:')) return 'remove';
  if (eventName.startsWith('ObjectRestore:')) return 'restore';
  if (eventName.startsWith('ReducedRedundancyLostObject:')) return 'rro';
  if (eventName.startsWith('Replication:')) return 'replication';
  return 'unknown';
};
