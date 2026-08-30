/**
 * Investor Profile questionnaire copy — questionnaireVersion 2.
 *
 * Source of truth: docs/releases/2026-09-signal/investor-profile-spec.md §3,
 * §5–§6, §17. Scanned by scan-copy like every /us content file. The enum
 * values these labels attach to live in
 * apps/web/src/lib/sec203a/investor-profile.ts and are the wire contract;
 * this file is presentation only.
 */

export const investorProfileCopy = {
  welcome: {
    headline: "Let's build your investor profile.",
    body: "A few questions help ReFi understand what this money is for, when you may need it, and how much market risk makes sense for your situation.",
    body2: "Most people finish in about five minutes. Estimates are fine.",
    whyWeAsk:
      "ReFi uses your answers to determine whether our service fits your needs and to shape the investment guidance we provide. You can update your profile when your circumstances change.",
    cta: "Start",
  },

  sections: {
    goal: "Your goal",
    timeline: "Timeline",
    finances: "Financial cushion",
    experience: "Experience",
    risk: "Risk",
    review: "Review",
  },

  accountType: {
    question: "Who will own this account?",
    options: {
      individual: "Me",
      joint: "Me and another person",
      trust: "A trust",
      entity: "A business or organization",
      professional_for_others: "I'm investing professionally for others",
    },
    entityExit: {
      headline: "ReFi for entities works differently.",
      body: "Business, trust, and fund accounts have their own onboarding. Leave your details and we'll be in touch.",
    },
    jointExit: {
      headline: "Joint accounts are almost here.",
      body: "A joint investor profile needs information from both owners, and we'd rather build that properly than base your profile on one person's circumstances. We'll let you know the moment joint onboarding is ready.",
    },
  },

  goal: {
    question: "What is the main job of this money?",
    helper:
      "Different money has different jobs. This helps us avoid treating a long-term portfolio like a savings account—or vice versa.",
    options: {
      long_term_wealth: "Build long-term wealth",
      retirement: "Retirement",
      major_purchase: "A major future purchase",
      education_family: "Education or family goal",
      income_generation: "Generate investment income",
      general_investing: "General investing",
      near_term_reserve: "Emergency or near-term expenses",
      other: "Something else",
    },
  },

  horizon: {
    question: "When might you first need a meaningful amount of this money?",
    helper: "Think about roughly 25% or more of the account.",
    options: {
      lt_1y: "Within a year",
      "1_3y": "1–3 years",
      "3_5y": "3–5 years",
      "5_10y": "5–10 years",
      gt_10y: "More than 10 years",
      unknown: "I'm not sure",
    },
  },

  withdrawalPattern: {
    question: "When you begin taking money out, how do you expect to use it?",
    options: {
      lump_sum: "Most or all at once",
      few_years: "Over a few years",
      gradual: "Gradually over many years",
      none_expected: "I don't currently expect to withdraw it",
      unsure: "I'm not sure",
    },
  },

  financesIntro: {
    headline: "A little context about your finances",
    body: "We use ranges wherever possible. We don't need exact balances to understand whether investment losses could interfere with your plans.",
  },

  incomeBand: {
    whyWeAsk:
      "Your income range helps us judge how much investment risk your plan can absorb. A range is enough.",
    question: "About how much do you earn in a typical year before taxes?",
    options: {
      lt_25k: "Under $25,000",
      "25_50k": "$25,000–$50,000",
      "50_100k": "$50,000–$100,000",
      "100_200k": "$100,000–$200,000",
      "200_500k": "$200,000–$500,000",
      gt_500k: "$500,000+",
      prefer_not: "Prefer not to answer",
    },
  },

  incomeStability: {
    whyWeAsk:
      "Two people with the same income can have very different capacity for loss. Predictability tells us which situation is yours.",
    question: "How predictable is your income right now?",
    options: {
      very_predictable: "Very predictable",
      mostly_predictable: "Mostly predictable",
      varies_considerably: "It varies considerably",
      between_sources: "I'm currently between regular income sources",
      prefer_not: "Prefer not to answer",
    },
  },

  netWorthBand: {
    whyWeAsk:
      "This helps us understand how much investment risk your overall financial situation can reasonably support. A range is enough.",
    question: "About how much is your total net worth?",
    helper: "Your assets minus what you owe. A range is enough.",
    options: {
      lt_50k: "Under $50k",
      "50_100k": "$50k–$100k",
      "100_250k": "$100k–$250k",
      "250_500k": "$250k–$500k",
      "500k_1m": "$500k–$1m",
      "1_5m": "$1m–$5m",
      gt_5m: "$5m+",
      prefer_not: "Prefer not to answer",
    },
  },

  liquidNetWorthBand: {
    whyWeAsk:
      "What you could actually access matters more than what you own on paper. It shapes how much risk fits this account.",
    question:
      "About how much of your net worth could reasonably be used or accessed for investing?",
    helper:
      "Include cash and investments you could reasonably access. Don't include your home or other assets you would not realistically sell to fund this account.",
  },

  accountShare: {
    whyWeAsk:
      "If this account is a large share of what you could access, losses matter more. That caps how much risk we'd suggest.",
    question:
      "Roughly how much of your liquid savings and investments would this ReFi account represent?",
    options: {
      lt_10pct: "Less than 10%",
      "10_25pct": "10–25%",
      "25_50pct": "25–50%",
      gt_50pct: "More than 50%",
      unsure: "I'm not sure",
    },
  },

  emergencyReserve: {
    whyWeAsk:
      "A cash cushion means market losses don't force selling at the wrong time. Less cushion, less room for risk.",
    question:
      "If something unexpected happened, how long could your current cash savings cover normal expenses?",
    options: {
      lt_1mo: "Less than 1 month",
      "1_3mo": "1–3 months",
      "3_6mo": "3–6 months",
      gt_6mo: "More than 6 months",
      unsure: "I'm not sure",
      prefer_not: "Prefer not to answer",
    },
  },

  debtSignal: {
    whyWeAsk:
      "High-interest debt competes with investing. We only need the shape of it, never balances.",
    question:
      "Do you carry high-interest debt that you don't normally pay off each month?",
    options: {
      none: "No",
      manageable: "Yes, but it is manageable",
      significant: "Yes, and it is significant",
      prefer_not: "Prefer not to answer",
    },
  },

  liquidityLikelihood: {
    whyWeAsk:
      "If you might need this money unexpectedly, your plan needs to keep more of it steady.",
    question:
      "How likely are you to need an unexpected withdrawal from this account?",
    options: {
      very_unlikely: "Very unlikely",
      possible: "Possible",
      likely: "Likely",
      unsure: "I'm not sure",
    },
  },

  knowledgeLevel: {
    question: "Which description sounds most like you?",
    options: {
      learning:
        "I'm learning — I understand some basics but don't regularly make investment decisions.",
      comfortable:
        "I'm comfortable with the basics — I understand stocks, ETFs, diversification and normal market risk.",
      experienced:
        "I'm experienced — I've managed investments through different market conditions.",
      highly_experienced:
        "I'm highly experienced — I regularly evaluate portfolios, investment strategies and risk.",
    },
  },

  experienceYears: {
    question: "How long have you been making your own investment decisions?",
    options: {
      lt_1y: "Less than 1 year",
      "1_3y": "1–3 years",
      "3_5y": "3–5 years",
      "5_10y": "5–10 years",
      gt_10y: "More than 10 years",
    },
  },

  productExperience: {
    question: "Which investments or strategies have you personally used?",
    helper: "Select all that apply.",
    options: {
      stocks: "Individual stocks",
      funds: "ETFs or mutual funds",
      bonds: "Bonds",
      options: "Options",
      margin_leverage: "Margin or leverage",
      digital_assets: "Digital assets",
      automated_services: "Automated investment services",
      quant_strategies: "Quantitative or algorithmic strategies",
      none: "None of these",
    },
  },

  riskSectionWhy:
    "There are no right answers here. These questions measure how you experience market movement — separately from what your finances can absorb — and the more cautious of the two shapes your profile.",

  drawdownBehavior: {
    question:
      "Markets fall sometimes. Imagine your ReFi account started at $50,000 and fell to $40,000 over several months. What would you most likely do?",
    options: {
      sell_all: "Sell most or all of it",
      sell_some: "Sell some and reduce my exposure",
      stay: "Stay invested",
      buy_more: "Invest more",
      unsure: "I'm genuinely not sure",
    },
  },

  lossThreshold: {
    question:
      "At what decline would you seriously reconsider staying invested?",
    options: {
      pct_5: "Around 5%",
      pct_10: "Around 10%",
      pct_20: "Around 20%",
      pct_30: "Around 30%",
      gt_30: "More than 30%",
      unsure: "I'm not sure",
    },
  },

  growthProtection: {
    question: "Which matters more for this money?",
    left: "Protecting the value of my investment",
    right: "Maximizing long-term growth",
  },

  riskTradeoff: {
    question: "Which investment experience would you rather live with?",
    options: {
      plan_a: "Plan A — Smaller market swings, lower expected long-term growth",
      plan_b:
        "Plan B — Moderate market swings, moderate expected long-term growth",
      plan_c:
        "Plan C — Larger market swings, greater long-term growth potential",
    },
  },

  restrictionDetails: {
    question: "Which companies, industries, or securities should we avoid?",
    helper:
      "Name them as specifically as you can. Separate multiple entries with commas — this is what lets us exclude them precisely.",
    fields: {
      employer_securities: "Your employer's securities (tickers or names)",
      legally_restricted: "Securities you're restricted from trading",
      specific_companies: "Companies to exclude",
      specific_industries: "Industries to exclude",
      other: "Anything else we should avoid",
    },
  },

  restrictions: {
    question: "Are there investments ReFi should avoid for you?",
    helper: "Select all that apply.",
    options: {
      none: "No restrictions",
      employer_securities: "Securities related to my employer",
      legally_restricted:
        "Securities I'm legally or professionally restricted from trading",
      specific_companies: "Specific companies",
      specific_industries: "Specific industries",
      other: "Other",
    },
  },

  expectedChange: {
    question:
      "Do you expect a major financial change in the next 12 months that could affect this money?",
    helper:
      "You don't need to provide personal details—only the financial impact that could affect your investment plan.",
    options: {
      no: "No",
      maybe: "Maybe",
      yes: "Yes",
    },
  },

  financialChangeKinds: {
    question: "What kind of change?",
    helper:
      "You don't need to provide personal details—only the financial impact that could affect your investment plan.",
    options: {
      income_employment: "Income or employment",
      retirement: "Retirement",
      major_purchase: "Major purchase",
      major_expense: "Major planned expense",
      savings_change: "Significant change in available savings",
      other: "Other",
    },
  },

  productIntent: {
    question: "What are you hoping ReFi helps you do?",
    helper: "Select all that apply.",
    options: {
      disciplined_long_term: "Build a disciplined long-term portfolio",
      personalized_signals: "Get personalized investment signals",
      reduce_emotional_decisions: "Reduce emotional investment decisions",
      diversify_existing: "Diversify investments I already hold",
      less_time: "Spend less time managing investments",
      understand_systematic: "Understand how a systematic strategy works",
      explore_alpha: "Explore experimental or alpha strategies",
    },
  },

  alphaLossImpact: {
    question:
      "Experimental strategies can lose substantially more than you expect. Would losing the full amount you allocate to an experimental strategy interfere with your normal expenses or financial obligations?",
    options: {
      yes: "Yes",
      no: "No",
      unsure: "I'm not sure",
    },
  },

  clarification: {
    headline: "Let's double-check one thing.",
    prompt: "Which answer would you like to revisit?",
    keepBoth: "Keep both answers as they are",
    flags: {
      SHORT_HORIZON_HIGH_WILLINGNESS: {
        body: "You told us you may need this money fairly soon, but you're also comfortable with substantial market declines.",
        explain:
          "A shorter timeline can leave less time for a portfolio to recover.",
      },
      GOAL_LIQUIDITY_CONFLICT: {
        body: "You told us this money is for emergencies or near-term expenses, but also that you're unlikely to need an unexpected withdrawal.",
        explain:
          "Emergency money usually needs to stay reachable — these two answers describe different jobs for the same account.",
      },
      RISK_BEHAVIOR_CONFLICT: {
        body: "You told us a 10% decline would make you seriously reconsider, but you also chose the plan with the largest market swings.",
        explain:
          "The plan you chose will regularly move more than the decline you said you'd reconsider at.",
      },
      EXPERIENCE_CONFLICT: {
        body: "You described yourself as still learning, but also said you've personally used advanced strategies like options, leverage, or quantitative trading.",
        explain:
          "We want to understand your experience correctly — it changes how we explain things, not how much risk you can take.",
      },
      CONCENTRATION_ALPHA_CONFLICT: {
        body: "This account would hold more than half of what you can access, and you're also interested in experimental strategies.",
        explain:
          "Experimental exposure is for money you could afford to lose entirely — concentrating most of your accessible savings there works against that.",
      },
      CAPACITY_WILLINGNESS_GAP: {
        body: "You told us you have less than a month of cash cushion, but you're also comfortable with the highest levels of market risk.",
        explain:
          "Without a cushion, a market decline can force selling at the worst time — comfort with risk doesn't change that math.",
      },
      INCONSISTENT_LOSS_BEHAVIOR: {
        body: "You said you'd invest more after a sharp fall, but also that a 10% decline would make you seriously reconsider staying invested.",
        explain:
          "Those two reactions point in different directions — knowing which one is really you changes your profile.",
      },
    },
  },

  review: {
    headline: "Review your answers",
    body: "You can change anything before we build your profile.",
    submit: "Build my profile",
    edit: "Edit",
  },

  result: {
    headline: "Your investor profile",
    capacityLabel: "Your financial capacity for market risk",
    willingnessLabel: "Your comfort with market movement",
    experienceLabel: "Your investing experience",
    timelineLabel: "Your timeline",
    fitLabel: "ReFi product fit",
    shapedHeadline: "What shaped your profile",
    cautionBinding:
      "Your comfort with investment risk is higher than your financial capacity for it. We use the more cautious constraint.",
    willingnessBinding:
      "Your financial capacity supports more market risk than you're comfortable taking. We use the more cautious constraint.",
    fitGood: "Good fit for long-term investing",
    fitConstrained: "Fits, with limits shaped by your circumstances",
    fitClarify: "We need to clarify something before advising on this money",
    notFit: {
      headline: "This money may have a different job.",
      body2: "Your profile can change as your circumstances change.",
      reasons: {
        HORIZON_NEAR_TERM_NOT_FIT:
          "You may need a meaningful amount of this money within a year. A stock-focused strategy needs more time than that to recover from a decline, so it isn't the right fit for this money right now.",
        PRODUCT_FIT_EMERGENCY_FUND:
          "This money is your emergency or near-term reserve. It needs to stay reachable and steady, and a stock-focused strategy can't promise either — so it isn't the right place for these funds.",
        PRODUCT_FIT_LOSS_INTOLERANT:
          "Your answers tell us a meaningful loss on this money isn't something you could stay invested through. A stock-focused strategy will have those moments, so it isn't the right fit right now.",
        PRODUCT_FIT_JOINT_UNSUPPORTED:
          "A joint investor profile needs information from both owners, and we don't build one from a single person's circumstances. Joint onboarding is coming.",
        PRODUCT_FIT_ENTITY_ROUTED:
          "Business, trust, and fund accounts have their own onboarding path.",
        fallback:
          "Based on what you've told us about this money, a stock-focused ReFi strategy may not be the right fit for it right now.",
      },
    },
    constraintReasons: {
      HORIZON_SHORT_CONSTRAINT:
        "Your timeline is on the shorter side, which limits how much market risk this money can carry.",
      LIQUIDITY_HIGH_NEED_CONSTRAINT:
        "You may need money from this account unexpectedly, so your plan keeps more of it steady.",
      CONCENTRATION_OVER_50PCT:
        "This account would hold more than half of what you can access, so we hold back from the highest risk levels.",
      CAPACITY_RESERVE_CONSTRAINT:
        "Your cash cushion is thin right now, which limits how much market risk makes sense.",
      CAPACITY_DEBT_CONSTRAINT:
        "Significant high-interest debt competes with investing, so we keep the risk level more cautious.",
      INCOME_INSTABILITY_CONSTRAINT:
        "Your income is in flux right now, which limits how much investment risk your plan can absorb.",
    },
  },
} as const;
