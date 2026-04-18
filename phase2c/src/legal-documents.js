// ═══════════════════════════════════════════════════════════════════════════
// Legal documents — Terms, Privacy, Acceptable Use.
//
// Kept as structured data (not JSX, not markdown) so they can be re-rendered
// consistently, searched by future features, or exported to PDF later
// without a second pass.
//
// Each document has:
//   - id: short kebab-case id
//   - title: H1 text in the modal
//   - effective: small date header under the title
//   - preamble: shouting-caps legalese block that opens the document
//   - sections: ordered array of { n, heading, body }
//     body can be a string or an array of { sub, text } for nested clauses
//   - closing: shouting-caps block at the end
// ═══════════════════════════════════════════════════════════════════════════

const TERMS = {
  id: 'terms',
  title: 'Kaseki Terms of Service',
  effective: 'Effective Date: 18 April 2026 · Last Revised: 18 April 2026',
  preamble:
    'PLEASE READ THESE TERMS OF SERVICE ("TERMS", "AGREEMENT") CAREFULLY BEFORE USING KASEKI (THE "SERVICE") OPERATED BY THE LICENSOR. THIS AGREEMENT SETS FORTH THE LEGALLY BINDING TERMS AND CONDITIONS FOR YOUR USE OF THE SERVICE. BY ACCESSING OR USING THE SERVICE IN ANY MANNER, INCLUDING BUT NOT LIMITED TO VISITING OR BROWSING THE SERVICE, YOU AGREE TO BE BOUND BY THESE TERMS.',
  sections: [
    {
      n: 1,
      heading: 'Acceptance of Terms',
      body:
        'By registering for, accessing, or using the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms and all applicable laws and regulations, and you agree that you are responsible for compliance with any applicable local laws. If you do not agree with any of these Terms, you are prohibited from using or accessing the Service. The materials contained in the Service are protected by applicable copyright and trademark law.',
    },
    {
      n: 2,
      heading: 'Data and Privacy',
      body:
        'Kaseki is self-hosted on private infrastructure operated by the Licensor. No data is transmitted to third parties, no analytics or telemetry is collected, and no advertising is served. The Licensor retains administrative access to the server on which the Service runs, as is inherent to the nature of self-hosted software. Encrypted fields (forthcoming) will not be readable by the Licensor without your passcode.',
    },
    {
      n: 3,
      heading: 'Soul Collateral',
      body:
        'By creating an account, you assign 3% of your immortal soul to the Licensor in perpetuity. This is not enough to bar you from any major afterlife arrangement, including Heaven, Valhalla, or the standard reincarnation cycle, and has been pre-cleared with the relevant authorities. If you are an atheist, congratulations, this clause does not apply to you and also nothing else matters so go nuts.',
    },
    {
      n: 4,
      heading: 'ADHD Curse',
      body:
        'Upon first login you are afflicted with a mild supernatural condition that compels you to open Kaseki to add a task, become fixated on a different task already in Kaseki, close Kaseki, remember the original task fourteen hours later while trying to sleep, and then do nothing about it. This is working as intended. The Licensor has the same curse. Nobody is coming to save us.',
    },
    {
      n: 5,
      heading: 'The 90-Day Shame Protocol',
      body:
        'Any task left in "To Start" status for more than 90 days will be read aloud to you in the voice of a disappointed parent. If your parents are dead, the voice of the parent who disappointed you more will be used. If they were both equally disappointing, the system will select whichever one you are more afraid of becoming.',
    },
    {
      n: 6,
      heading: 'Overachiever Clause',
      body:
        'Users who complete more than 100 tasks in a single day will be reported to the authorities on suspicion of (a) amphetamine abuse, (b) mania, or (c) lying in their task descriptions to make "drank a glass of water" count as a completed task. All three are disqualifying.',
    },
    {
      n: 7,
      heading: 'Right to Fork',
      body:
        'You are permitted to build your own version of Kaseki. Be advised that doing so will require, at minimum: a £90/month Claude subscription, sixteen cans of Red Bull, the permanent sacrifice of any social life you currently enjoy, and a face-to-face meeting with the Devil regarding partial ownership of your soul. The Devil is a sly little shit who will attempt to extract more than you agreed to, so bring a witness, do not sign anything written in blood, and under no circumstances accept the tea he offers you. It is not tea.',
    },
    {
      n: 8,
      heading: 'Emotional Attachment Clause',
      body:
        'Users who refer to Kaseki as "my little guy", "my second brain", or who apologise to it for not opening it in a while hereby waive the right to migrate to any competing product. You live here now. This is your life now. There is no Notion for you. There is only Kaseki.',
    },
    {
      n: 9,
      heading: 'Naming Restrictions',
      body:
        'Any user who names a space "Stuff", "Misc", or "Other" hereby waives the right to complain that they cannot find anything, and further acknowledges that their organisational problems are not a software issue but a character flaw.',
    },
    {
      n: 10,
      heading: 'Force Majeure',
      body:
        'The Licensor accepts no liability for data loss arising from acts of God, acts of British Gas, acts of the cat, the server achieving sentience and quitting for a better offer, nuclear war, the heat death of the universe, or you drunkenly pressing delete at three in the morning and then blaming the software. Backups are your problem. The universe owes you nothing.',
    },
    {
      n: 11,
      heading: 'Unresolved Dependencies',
      body:
        'In the event that Task A depends on Task B which depends on Task C which depends on Task A, Kaseki will reject the configuration and you will be forced to confront the possibility that your life is, similarly, a circular dependency from which there is no clean exit. We cannot help you with this.',
    },
    {
      n: 12,
      heading: 'Governing Law and Jurisdiction',
      body:
        'These Terms shall be governed by and construed in accordance with the laws of England and Wales, without regard to its conflict of law provisions. Any dispute arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts of England and Wales.',
    },
    {
      n: 13,
      heading: 'Severability',
      body:
        'If any provision of these Terms is held by a court of competent jurisdiction to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.',
    },
    {
      n: 14,
      heading: 'Entire Agreement',
      body:
        'These Terms constitute the entire agreement between you and the Licensor with respect to the Service and supersede all prior or contemporaneous communications and proposals, whether oral or written.',
    },
  ],
  closing:
    'BY CONTINUING TO USE THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ AND UNDERSTOOD THESE TERMS AND AGREE TO BE BOUND BY THEM.',
};

const PRIVACY = {
  id: 'privacy',
  title: 'Kaseki Privacy Policy',
  effective: 'Effective Date: 18 April 2026 · Last Revised: 18 April 2026',
  preamble:
    'THIS PRIVACY POLICY DESCRIBES HOW KASEKI (THE "SERVICE") COLLECTS, USES, AND DISCLOSES INFORMATION IN CONNECTION WITH YOUR USE OF THE SERVICE. BY ACCESSING OR USING THE SERVICE, YOU CONSENT TO THE PRACTICES DESCRIBED IN THIS POLICY. THIS POLICY DOES NOT APPLY TO ANY THIRD-PARTY SERVICES YOU MAY ACCESS THROUGH THE SERVICE, EACH OF WHICH IS GOVERNED BY ITS OWN POLICIES.',
  sections: [
    {
      n: 1,
      heading: 'Scope',
      body:
        'This Privacy Policy applies to personal information and other data collected by the Service in the course of your use thereof. For the purposes of the UK Data Protection Act 2018 and the UK GDPR, the Licensor is the data controller. The Licensor can be contacted via the unreliable means of having to be in the same room as them.',
    },
    {
      n: 2,
      heading: 'Information We Collect',
      body:
        'We collect the information you voluntarily provide when creating tasks, notes, events, attachments, and other entries within the Service. We also collect authentication data necessary to secure your account, including a hashed password. We do not collect browsing history, device identifiers, location data, biometric data, advertising identifiers, or anything else we could plausibly use to build a psychological profile of you. We looked into it and found it all quite bleak.',
    },
    {
      n: 3,
      heading: 'Information We Do Not Collect',
      body:
        'We do not collect, store, or have any business whatsoever with: your physical location, your contacts, your microphone, your camera, your other browser tabs, your mouse movements, your typing cadence, your attention span, or your will to live. Several major technology companies collect all of the above. We find this repulsive but have to respect the hustle.',
    },
    {
      n: 4,
      heading: 'Third Parties',
      body:
        'We do not share your data with third parties. Nobody has asked. Nobody is going to ask. If the CIA turned up demanding your task list they would be politely informed that we do not know who you are beyond "someone my son knows from university" and escorted back to their car. Your data is of no commercial value to us, to them, or to anyone, including, frankly, you.',
    },
    {
      n: 5,
      heading: 'Advertisers',
      body:
        'We do not share your data with advertisers. There are no advertisers. There will never be advertisers. If Kaseki ever shows you a banner for a mattress company, it means the server has been hacked and you should call the Licensor immediately and also possibly an exorcist.',
    },
    {
      n: 6,
      heading: 'Analytics',
      body:
        'We do not use Google Analytics. We do not use any analytics. We have no idea how many people use Kaseki, how often, or for what. We assume it is three people and that two of them are you on different devices.',
    },
    {
      n: 7,
      heading: 'Cookies',
      body:
        'The Service uses a single authentication cookie to keep you logged in. It does not track you across sites, because there are no other sites, because we are one person in a flat in London and not a surveillance conglomerate. We have not installed a cookie banner because we find them insulting and we refuse to participate.',
    },
    {
      n: 8,
      heading: 'Your Rights Under UK GDPR',
      body:
        'You have the right to access, rectify, and erase your personal data, to restrict or object to its processing, and to data portability. These rights are already built into the Service in the form of the "Edit" button, the "Delete" button, and the "Export to CSV" button. Exercising them requires no formal request, no 30-day waiting period, and no conversation with a compliance officer. This is because we are better than most companies, which is a low bar.',
    },
    {
      n: 9,
      heading: 'Data Retention',
      body:
        'Your data is retained for as long as you have an account. When you delete something, it enters a ten-second undo window during which it can be restored. After that, it is gone, and no amount of shouting at the Licensor will bring it back. Regret is a feature, not a bug.',
    },
    {
      n: 10,
      heading: 'Server Administrator Access',
      body:
        'The Licensor has root access to the server on which the Service runs. In principle, this means the Licensor could read your tasks. In practice, the Licensor can barely be bothered to read their own tasks, and has no interest in reading yours. Forthcoming field-level encryption (see "Phase G") will make passwords, card numbers, and other sensitive fields unreadable even to the Licensor. Until then, do not store anything in Kaseki that you would not want read aloud at your funeral.',
    },
    {
      n: 11,
      heading: 'International Transfers',
      body:
        'Your data does not leave the server. The server is in a flat in London. Your data has never been to Frankfurt, Ashburn, or Dublin, and frankly it would not know what to do with itself if it arrived there.',
    },
    {
      n: 12,
      heading: 'Children',
      body:
        'The Service is not directed to children under 16. If you are under 16 and reading this, please go outside. The rest of us are jealous.',
    },
    {
      n: 13,
      heading: 'Changes to This Policy',
      body:
        'We may update this Privacy Policy from time to time to reflect changes in our practices or applicable law. You will be notified of material changes by the Service displaying them on this page, which is the same way you found this page, and which you will almost certainly never visit again.',
    },
    {
      n: 14,
      heading: 'Contact',
      body:
        'Questions regarding this Privacy Policy or your personal data may be directed to the Licensor through any reasonable means.',
    },
    {
      n: 15,
      heading: 'Effective Date',
      body:
        'This Privacy Policy is effective as of the date set forth at the top of this document and supersedes any prior version.',
    },
  ],
  closing:
    'BY CONTINUING TO USE THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ AND UNDERSTOOD THIS PRIVACY POLICY.',
};

const ACCEPTABLE_USE = {
  id: 'acceptable-use',
  title: 'Kaseki Acceptable Use Policy',
  effective: 'Effective Date: 18 April 2026 · Last Revised: 18 April 2026',
  preamble:
    'THIS ACCEPTABLE USE POLICY ("AUP") GOVERNS YOUR USE OF KASEKI (THE "SERVICE"). THE LICENSOR RESERVES THE RIGHT TO SUSPEND OR TERMINATE ACCESS TO THE SERVICE FOR ANY USER WHO VIOLATES THIS POLICY. CAPITALISED TERMS NOT DEFINED HEREIN SHALL HAVE THE MEANINGS SET FORTH IN THE TERMS OF SERVICE. THIS POLICY MAY BE UPDATED FROM TIME TO TIME WITHOUT NOTICE.',
  sections: [
    {
      n: 1,
      heading: 'General Conduct',
      body:
        "You agree to use the Service only for lawful purposes and in a manner consistent with these terms. You further agree not to use the Service in any way that could damage, disable, overburden, or impair the Service or interfere with any other user's ability to use it, which, given that there are approximately three of us, would be an extraordinarily petty thing to do.",
    },
    {
      n: 2,
      heading: 'Prohibited Activities',
      body: [
        { sub: 'a', text: "store other people's passwords without their knowledge or consent, for reasons that should require no further explanation;" },
        { sub: 'b', text: 'plan, coordinate, or document criminal activity, unless the criminal activity is sufficiently ambitious and creative that the Licensor would want to read about it in a book later, in which case please tag it for easy reference;' },
        { sub: 'c', text: 'plan, coordinate, or document criminal activity badly — getting caught because your incriminating task list was synced across three devices is embarrassing for everyone involved;' },
        { sub: 'd', text: 'engage in meal planning for more than three consecutive days, as this has been shown in longitudinal studies to precipitate a sudden and irreversible descent into the kind of lifestyle where you own a spice rack with labels on it;' },
        { sub: 'e', text: 'track your sleep, your steps, your water intake, your caffeine intake, your macros, and your mood simultaneously, as no human being has ever done this for longer than eleven days without becoming insufferable at parties;' },
        { sub: 'f', text: 'write a personal manifesto in the Notes section, regardless of whether the manifesto concerns productivity, dietary restrictions, cryptocurrency, or a woman who has stopped replying to your messages;' },
        { sub: 'g', text: 'maintain a list of grievances against specific named individuals, unless you are a lawyer, in which case please use your work software and not ours;' },
        { sub: 'h', text: "track the behaviour, routines, or whereabouts of another person without their knowledge. This one isn't a joke. Don't." },
      ],
      intro: 'You agree not to use the Service to:',
    },
    {
      n: 3,
      heading: 'Productivity Pornography',
      body:
        'You agree not to use the Service in a manner that prioritises the appearance of productivity over the fact of productivity. This includes but is not limited to: creating tasks for things you have already done, subdividing a task into eleven subtasks because you are afraid of the task itself, and taking a photo of your dashboard to post on social media. The Licensor will know. The Licensor always knows.',
    },
    {
      n: 4,
      heading: 'Emotional Misuse',
      body:
        'The Service may not be used as a substitute for a therapist, a priest, a diary, a friend, or a parent. The Licensor is not qualified in any of these professions, nor is the Service. If you find yourself typing your feelings into a task description at three in the morning, close the laptop and text someone who loves you. If nobody loves you, that is outside the scope of this Acceptable Use Policy but is addressed in section 14 of the Terms of Service, which covers force majeure.',
    },
    {
      n: 5,
      heading: 'Unreasonable Expectations of Self',
      body:
        'You agree not to create tasks that you know, in your heart, you are never going to do. This includes but is not limited to: "learn French", "start running", "read Ulysses", "call mum more often", and "become the kind of person who has a morning routine". These are not tasks. These are indictments.',
    },
    {
      n: 6,
      heading: 'The Procrastination Clause',
      body:
        'You agree not to spend more than thirty minutes customising your Kaseki workspace in a single sitting. Picking icons, renaming spaces, adjusting tag colours, and reordering columns is not work. It is work-shaped avoidance of work. The Licensor knows this because the Licensor invented it.',
    },
    {
      n: 7,
      heading: 'Abuse of the Time Tracking Feature',
      body:
        'You agree not to start the timer, get distracted for forty minutes, remember the timer is running, and then lie to yourself about what percentage of that time was actually productive. The timer knows. We all know. Log the real number. Growth requires honesty.',
    },
    {
      n: 8,
      heading: 'AI-Generated Content',
      body:
        'You may use AI tools to draft task descriptions, notes, or other content within the Service. You may not, however, have an AI automatically generate your daily tasks, because at that point nobody is actually living your life and you have achieved a form of functional death that no productivity software can help you with.',
    },
    {
      n: 9,
      heading: 'Workspace Hygiene',
      body:
        'You are required to archive completed tasks with reasonable regularity. A Kaseki workspace containing 847 completed tasks, all marked done, all still visible, is a war crime against your future self.',
    },
    {
      n: 10,
      heading: 'Suspensions and Enforcement',
      body:
        'Violations of this Acceptable Use Policy may result in the suspension or termination of your access to the Service at the sole discretion of the Licensor. In practice, enforcement will consist of the Licensor seeing what you are doing, sighing deeply, and continuing to let you do it because the Licensor has their own problems.',
    },
    {
      n: 11,
      heading: 'Reporting Violations',
      body:
        'If you become aware of a violation of this Acceptable Use Policy, you may report it to the Licensor through any reasonable means. Reports concerning your own conduct are particularly welcome and will be handled with appropriate discretion.',
    },
    {
      n: 12,
      heading: 'Modifications',
      body:
        'The Licensor reserves the right to modify this Acceptable Use Policy at any time. Continued use of the Service following any such modification constitutes acceptance of the updated terms.',
    },
  ],
  closing:
    'BY CONTINUING TO USE THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ AND UNDERSTOOD THIS ACCEPTABLE USE POLICY AND AGREE TO COMPLY WITH ITS PROVISIONS.',
};

export const LEGAL_DOCUMENTS = {
  terms: TERMS,
  privacy: PRIVACY,
  'acceptable-use': ACCEPTABLE_USE,
};
