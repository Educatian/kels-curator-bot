import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const CATEGORIES = [
  ['all', 'Everything indexed by the bot'],
  ['jobs', 'Academic and practitioner jobs'],
  ['cfp', 'Calls for papers, proposals, and grants'],
  ['seminars', 'Seminars, webinars, podcasts, and workshops'],
  ['resources', 'Academic resources and reusable guides'],
  ['events', 'Meetups, gatherings, and community events'],
];

const CATEGORY_CHOICES = CATEGORIES.map(([name]) => ({ name, value: name }));

export function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName('digest')
      .setDescription('Summarize recent KELS opportunities and resources.')
      .addStringOption((option) =>
        option
          .setName('category')
          .setDescription('What to summarize')
          .setRequired(false)
          .addChoices(...CATEGORY_CHOICES),
      )
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('How many recent days to include')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(90),
      ),
    new SlashCommandBuilder()
      .setName('search')
      .setDescription('Search indexed KELS posts.')
      .addStringOption((option) =>
        option
          .setName('query')
          .setDescription('Keyword, topic, institution, or phrase')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('category')
          .setDescription('Optional category filter')
          .setRequired(false)
          .addChoices(...CATEGORY_CHOICES),
      ),
    new SlashCommandBuilder()
      .setName('watch')
      .setDescription('Manage personal keyword alerts.')
      .addStringOption((option) =>
        option
          .setName('action')
          .setDescription('Add, remove, or list your watch keywords')
          .setRequired(true)
          .addChoices(
            { name: 'add', value: 'add' },
            { name: 'remove', value: 'remove' },
            { name: 'list', value: 'list' },
          ),
      )
      .addStringOption((option) =>
        option
          .setName('keyword')
          .setDescription('Keyword to add or remove')
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('Manage your personal KELS research-topic profile.')
      .addStringOption((option) =>
        option
          .setName('action')
          .setDescription('Add, remove, or list your research topics')
          .setRequired(true)
          .addChoices(
            { name: 'add', value: 'add' },
            { name: 'remove', value: 'remove' },
            { name: 'list', value: 'list' },
          ),
      )
      .addStringOption((option) =>
        option
          .setName('topic')
          .setDescription('Research topic, method, venue, or opportunity type')
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName('ask-kels')
      .setDescription('Ask Qwen to answer from the indexed KELS archive.')
      .addStringOption((option) =>
        option
          .setName('query')
          .setDescription('Question about indexed KELS posts')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('category')
          .setDescription('Optional category filter')
          .setRequired(false)
          .addChoices(...CATEGORY_CHOICES),
      ),
    new SlashCommandBuilder()
      .setName('cfp-helper')
      .setDescription('Summarize a CFP/RFP and produce a preparation checklist.')
      .addStringOption((option) =>
        option
          .setName('text')
          .setDescription('CFP/RFP URL or pasted announcement text')
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName('topic-digest')
      .setDescription('Create a focused digest for one research topic.')
      .addStringOption((option) =>
        option
          .setName('topic')
          .setDescription('Topic such as AIED, CSCL, learning analytics, or AI ethics')
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('How many recent days to include')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(365),
      ),
    new SlashCommandBuilder()
      .setName('field-map')
      .setDescription('Position a topic or abstract in the connected Field Explorer map.')
      .addStringOption((option) =>
        option
          .setName('query')
          .setDescription('Topic, CFP, project idea, or abstract to position')
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('How many days of KELS archive posts to connect')
          .setRequired(false)
          .setMinValue(7)
          .setMaxValue(365),
      ),
    new SlashCommandBuilder()
      .setName('venue-scout')
      .setDescription('Scout possible journal/conference lanes for a project idea or abstract.')
      .addStringOption((option) =>
        option
          .setName('text')
          .setDescription('Project idea, abstract, CFP fit note, or paper summary')
          .setRequired(true),
      )
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('How many days of KELS archive posts to connect')
          .setRequired(false)
          .setMinValue(7)
          .setMaxValue(365),
      ),
    new SlashCommandBuilder()
      .setName('field-pulse')
      .setDescription('Show recent KELS activity positioned against the Field Explorer map.')
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('How many recent days to include')
          .setRequired(false)
          .setMinValue(7)
          .setMaxValue(60),
      ),
    new SlashCommandBuilder()
      .setName('profile-suggest')
      .setDescription('Suggest personal profile topics from your KELS activity.')
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('How many recent days of your activity to inspect')
          .setRequired(false)
          .setMinValue(7)
          .setMaxValue(365),
      ),
    new SlashCommandBuilder()
      .setName('anon-submit')
      .setDescription('Submit an anonymous advice request for moderator review.')
      .addStringOption((option) =>
        option
          .setName('category')
          .setDescription('Advice category')
          .setRequired(true)
          .addChoices(
            { name: 'career', value: 'career' },
            { name: 'paper-research', value: 'paper-research' },
            { name: 'grad-school', value: 'grad-school' },
            { name: 'teaching', value: 'teaching' },
            { name: 'community', value: 'community' },
            { name: 'other', value: 'other' },
          ),
      )
      .addStringOption((option) =>
        option
          .setName('text')
          .setDescription('Your concern or question. It will be reviewed before anonymous posting.')
          .setRequired(true)
          .setMaxLength(1800),
      ),
    new SlashCommandBuilder()
      .setName('submit-cfp')
      .setDescription('Create a clean CFP/RFP entry for the archive.')
      .addStringOption((option) =>
        option.setName('title').setDescription('CFP/RFP title').setRequired(true),
      )
      .addStringOption((option) =>
        option.setName('deadline').setDescription('Proposal, abstract, or paper deadline').setRequired(true),
      )
      .addStringOption((option) =>
        option.setName('url').setDescription('Official URL').setRequired(true),
      )
      .addStringOption((option) =>
        option.setName('notes').setDescription('Optional scope, audience, or eligibility note').setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName('backfill')
      .setDescription('Index recent messages from a channel or forum.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Channel to index; defaults to the current channel')
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName('limit')
          .setDescription('Maximum messages to index')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(100),
      ),
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Show KELS archive health and category counts.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName('health')
      .setDescription('Check bot runtime health, archive state, and current-channel permissions.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName('post-digest')
      .setDescription('Post a digest to the current or selected channel.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption((option) =>
        option
          .setName('category')
          .setDescription('What to summarize')
          .setRequired(false)
          .addChoices(...CATEGORY_CHOICES),
      )
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('How many recent days to include')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(90),
      )
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Where to post; defaults to the current channel')
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName('post-field-pulse')
      .setDescription('Post a Field Pulse summary to the current or selected channel.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('How many recent days to include')
          .setRequired(false)
          .setMinValue(7)
          .setMaxValue(60),
      )
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Where to post; defaults to the current channel')
          .setRequired(false),
      ),
    new SlashCommandBuilder()
      .setName('community-graph')
      .setDescription('Summarize the KELS activity graph across users, posts, commands, reactions, and topics.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('How many recent days to include')
          .setRequired(false)
          .setMinValue(7)
          .setMaxValue(365),
      ),
    new SlashCommandBuilder()
      .setName('curation-feedback')
      .setDescription('Show feedback signals for KELS curation from reactions, slash queries, and topic matches.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('How many recent days to include')
          .setRequired(false)
          .setMinValue(7)
          .setMaxValue(365),
      ),
    new SlashCommandBuilder()
      .setName('deadlines')
      .setDescription('Show upcoming KELS deadlines extracted from indexed posts.')
      .addIntegerOption((option) =>
        option
          .setName('days')
          .setDescription('How far ahead to look')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(365),
      )
      .addStringOption((option) =>
        option
          .setName('category')
          .setDescription('Optional category filter')
          .setRequired(false)
          .addChoices(...CATEGORY_CHOICES),
      ),
    new SlashCommandBuilder()
      .setName('help-kels')
      .setDescription('Show how to use the KELS curator bot.'),
  ];
}
