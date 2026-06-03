import { rankFieldTopics, tokenize } from './field-explorer.js';
import { rankPostsForQuery } from './relevance.js';

export function buildCommunityGraph({ posts = [], logs = [], fieldTopics = [], topicLimit = 2 } = {}) {
  const nodes = new Map();
  const edges = [];
  const postMap = new Map(posts.map((post) => [post.id, post]));

  for (const post of posts) {
    addNode(nodes, `user:${post.authorId}`, 'user', post.authorName || post.authorId);
    addNode(nodes, `post:${post.id}`, 'post', shortText(post.content, 90), {
      channelName: post.channelName,
      createdAt: post.createdAt,
    });
    addNode(nodes, `channel:${post.channelName}`, 'channel', `#${post.channelName}`);
    addEdge(edges, `user:${post.authorId}`, `post:${post.id}`, 'posted');
    addEdge(edges, `post:${post.id}`, `channel:${post.channelName}`, 'in_channel');

    for (const topic of rankFieldTopics(post.content ?? '', fieldTopics, { limit: topicLimit })) {
      addNode(nodes, `topic:${topic.name}`, 'topic', topic.name, { score: topic.score });
      addEdge(edges, `post:${post.id}`, `topic:${topic.name}`, 'matched_topic', { score: topic.score });
    }
  }

  for (const log of logs) {
    if (log.userId) addNode(nodes, `user:${log.userId}`, 'user', log.userName || log.userId);

    if (log.eventType === 'slash-command') {
      const commandName = log.commandName || 'unknown';
      addNode(nodes, `command:${commandName}`, 'command', `/${commandName}`);
      if (log.userId) addEdge(edges, `user:${log.userId}`, `command:${commandName}`, 'used_command');
      for (const topic of rankFieldTopics(log.query ?? '', fieldTopics, { limit: 2 })) {
        addNode(nodes, `topic:${topic.name}`, 'topic', topic.name, { score: topic.score });
        addEdge(edges, `command:${commandName}`, `topic:${topic.name}`, 'asked_about_topic', { score: topic.score });
      }
    }

    if (log.eventType === 'reaction-add') {
      const messageId = log.metadata?.messageId;
      if (!messageId) continue;
      const post = postMap.get(messageId);
      addNode(nodes, `post:${messageId}`, 'post', post ? shortText(post.content, 90) : `message ${messageId}`, {
        channelName: post?.channelName || log.channelName,
        createdAt: post?.createdAt || log.createdAt,
      });
      if (log.userId) {
        addEdge(edges, `user:${log.userId}`, `post:${messageId}`, 'reacted', {
          emoji: log.metadata?.emoji || log.query,
        });
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    edges,
    summary: summarizeGraph(nodes, edges),
  };
}

export function buildCurationFeedback({ posts = [], logs = [], fieldTopics = [] } = {}) {
  const postMap = new Map(posts.map((post) => [post.id, {
    post,
    reactions: 0,
    reactionUsers: new Set(),
    queryMatches: 0,
    score: 0,
  }]));
  const slashQueries = logs
    .filter((log) => log.eventType === 'slash-command' && log.query)
    .map((log) => log.query);

  for (const log of logs) {
    if (log.eventType !== 'reaction-add') continue;
    const messageId = log.metadata?.messageId;
    if (!messageId) continue;
    const entry = postMap.get(messageId);
    if (!entry) continue;
    entry.reactions += 1;
    if (log.userId) entry.reactionUsers.add(log.userId);
  }

  for (const query of slashQueries) {
    for (const rankedPost of rankPostsForQuery(query, posts, { limit: 5 })) {
      if ((rankedPost.relevance ?? 0) <= 0) continue;
      const entry = postMap.get(rankedPost.id);
      if (entry) entry.queryMatches += 1;
    }
  }

  const topPosts = [...postMap.values()]
    .map((entry) => {
      const uniqueReactionUsers = entry.reactionUsers.size;
      return {
        ...entry,
        uniqueReactionUsers,
        score: entry.reactions * 3 + uniqueReactionUsers * 2 + entry.queryMatches * 2,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.reactions - a.reactions)
    .slice(0, 8)
    .map(({ post, reactions, uniqueReactionUsers, queryMatches, score }) => ({
      post,
      reactions,
      uniqueReactionUsers,
      queryMatches,
      score,
    }));

  const topicSignals = new Map();
  for (const entry of topPosts) {
    for (const topic of rankFieldTopics(entry.post.content ?? '', fieldTopics, { limit: 2 })) {
      const current = topicSignals.get(topic.name) ?? {
        topic: topic.name,
        score: 0,
        posts: 0,
        reactions: 0,
        queryMatches: 0,
      };
      current.score += entry.score + topic.score;
      current.posts += 1;
      current.reactions += entry.reactions;
      current.queryMatches += entry.queryMatches;
      topicSignals.set(topic.name, current);
    }
  }

  const commandUsage = countBy(logs.filter((log) => log.eventType === 'slash-command'), (log) => log.commandName || 'unknown');
  return {
    totalPosts: posts.length,
    totalLogs: logs.length,
    commandUsage,
    topPosts,
    topicSignals: [...topicSignals.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8),
    recommendationFeedback: logs
      .filter((log) => ['weekly-article-recommendation', 'weekly-tech-signal'].includes(log.eventType))
      .map((log) => ({
        eventType: log.eventType,
        query: log.query,
        createdAt: log.createdAt,
      }))
      .slice(-5),
  };
}

export function suggestProfileTopics({ userId, existingTopics = [], posts = [], logs = [], fieldTopics = [], limit = 5 } = {}) {
  const evidence = [];
  for (const post of posts) {
    if (post.authorId === userId) {
      evidence.push({ source: 'post', text: post.content ?? '', channelName: post.channelName, createdAt: post.createdAt });
    }
  }

  const postMap = new Map(posts.map((post) => [post.id, post]));
  for (const log of logs) {
    if (log.userId !== userId) continue;
    if (log.eventType === 'slash-command' && log.query) {
      evidence.push({ source: `/${log.commandName}`, text: log.query, channelName: log.channelName, createdAt: log.createdAt });
    }
    if (log.eventType === 'reaction-add') {
      const post = postMap.get(log.metadata?.messageId);
      if (post) {
        evidence.push({ source: `reaction ${log.metadata?.emoji || log.query || ''}`.trim(), text: post.content ?? '', channelName: post.channelName, createdAt: log.createdAt });
      }
    }
  }

  const combined = evidence.map((item) => item.text).join('\n');
  const existing = new Set(existingTopics.map((topic) => normalizeTopic(topic)));
  const ranked = rankFieldTopics(combined, fieldTopics, { limit: Math.max(limit * 2, 8) })
    .filter((topic) => !existing.has(normalizeTopic(topic.name)))
    .slice(0, limit)
    .map((topic) => ({
      topic: topic.name,
      score: topic.score,
      evidence: evidenceForTopic(topic, evidence),
    }));

  const tokenSuggestions = [...new Set(tokenize(combined))]
    .filter((token) => token.length >= 4 && !existing.has(normalizeTopic(token)))
    .slice(0, Math.max(0, limit - ranked.length))
    .map((topic) => ({
      topic,
      score: 1,
      evidence: evidence.slice(0, 2),
    }));

  return {
    evidenceCount: evidence.length,
    suggestions: [...ranked, ...tokenSuggestions].slice(0, limit),
  };
}

function evidenceForTopic(topic, evidence) {
  const topicTokens = new Set(tokenize([topic.name, ...(topic.keywords ?? [])].join(' ')));
  return evidence
    .map((item) => ({
      ...item,
      overlap: tokenize(item.text).filter((token) => topicTokens.has(token)).length,
    }))
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3)
    .map(({ overlap, ...item }) => item);
}

function addNode(nodes, id, type, label, metadata = {}) {
  const current = nodes.get(id);
  if (current) {
    current.weight += 1;
    current.metadata = { ...current.metadata, ...metadata };
    return current;
  }
  const node = { id, type, label, weight: 1, metadata };
  nodes.set(id, node);
  return node;
}

function addEdge(edges, source, target, type, metadata = {}) {
  edges.push({ source, target, type, weight: 1, metadata });
}

function summarizeGraph(nodes, edges) {
  return {
    nodeCount: nodes.size,
    edgeCount: edges.length,
    nodeTypes: countBy([...nodes.values()], (node) => node.type),
    edgeTypes: countBy(edges, (edge) => edge.type),
    topUsers: [...nodes.values()].filter((node) => node.type === 'user').sort((a, b) => b.weight - a.weight).slice(0, 8),
    topTopics: [...nodes.values()].filter((node) => node.type === 'topic').sort((a, b) => b.weight - a.weight).slice(0, 8),
  };
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));
}

function shortText(text, max) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length <= max ? value : `${value.slice(0, max - 3).trim()}...`;
}

function normalizeTopic(value) {
  return String(value ?? '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
}
