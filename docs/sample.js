// Offline fallback: one real edition (2026-05-08) and a synthetic 40-day register.
window.SAMPLE_DATES = (() => { const out = []; const d = new Date('2026-03-30T12:00:00Z'); while (out.length < 40) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; })();
window.SAMPLE_MD = `# Daily Security Briefing — 2026-05-08

## Domestic US Security

CISA unveiled its "CI Fortify" initiative in early May 2026, releasing emergency planning guidance directing critical infrastructure owners and operators — including water utilities, transportation systems, and defense-related facilities — to prepare for operating under a geopolitical conflict scenario in which connections to the internet, telecommunications providers, and third-party vendors may be fully severed. The guidance centers on two planning objectives: "isolation," which involves proactively disconnecting operational technology from third-party and business networks, and "recovery," which requires operators to document systems, maintain offline backups, and practice transitioning to manual operations if isolation fails. CISA stated that for planning purposes, operators should assume adversaries will have some level of access to their OT networks and that all upstream dependencies will be unreliable during a crisis. The agency announced it will conduct targeted assessments of readiness at "defense critical infrastructure" facilities including dams, radars, weapon systems, and satellite communications nodes.

**Sources:**
- Federal News Network: https://federalnewsnetwork.com/cybersecurity/2026/05/cisa-tells-critical-organizations-to-prepare-for-cyber-outages/
- Nextgov/FCW: https://www.nextgov.com/cybersecurity/2026/05/cisa-unveils-ci-fortify-help-secure-critical-infrastructure-during-conflicts/413333/
- The Record: https://therecord.media/cisa-initiative-aims-for-critical-infrastructure-to-operate-during-cyberattacks
- CISA: https://www.cisa.gov/topics/industrial-control-systems/ci-fortify

**OSINT X Accounts:** @CISAgov, @CISACyber, @DHSgov, @sentdefender, @FBI, @CYBERCOM_DIRNSA

---

## China / Taiwan

Taiwan's legislature passed a special defense budget of 780 billion NTD (~$25 billion USD) on May 8, despite opposition from the KMT, though the measure excludes funding for domestic weapons development and the T-Dome missile defense network. That same day, Taiwan's Ministry of National Defense reported 12 PLA aircraft sorties in the preceding 24-hour period, with 10 crossing the Taiwan Strait median line and entering Taiwan's northern, southwestern, and eastern ADIZ; six PLAN vessels and two official ships were also detected operating in surrounding waters. President Lai Ching-te completed a transit to Taiwan's sole African ally, Eswatini, aboard a private aircraft after Beijing pressured multiple countries to deny overflight permissions. Separately, the PLA shadowed US-led Balikatan multinational exercises in the West Philippine Sea with four surface vessels and H-6 bombers near Scarborough Shoal.

**Sources:**
- AEI China & Taiwan Update: https://www.aei.org/articles/china-taiwan-update-may-8-2026/
- ROC MND via GlobalSecurity: https://www.globalsecurity.org/wmd/library/news/taiwan/2026/taiwan-260508-roc-mnd01.htm

**OSINT X Accounts:** @PLATracker, @IndoPac_Info, @TaiwansDefense, @EBKania, @BonnieGlaser, @AsianOSINT

---

## Russia / Ukraine

On May 8, 2026, President Trump announced a surprise three-day ceasefire between Russia and Ukraine covering May 9–11, timed to coincide with Russia's Victory Day commemoration and a prisoner exchange of 1,000 troops per side. Both Ukrainian President Zelensky and Kremlin foreign affairs adviser Yuri Ushakov confirmed the agreement. On the battlefield, ISW's May 8 assessment noted that Russian forces likely no longer hold any positions inside Kupyansk city after months of failing to reinforce a small, isolated infiltration force there. Ukrainian forces recorded 208 combat engagements over the preceding 24 hours, while Russian forces launched 99 airstrikes dropping 292 guided aerial bombs and deployed over 9,100 kamikaze drones.

**Sources:**
- Al Jazeera: https://www.aljazeera.com/news/2026/5/8/trump-announces-three-day-ceasefire-in-russia-ukraine-war
- Kyiv Independent: https://kyivindependent.com/breaking-trump-announces-3-day-ceasefire-between-russia-and-ukraine/
- ISW / Kyiv Post: https://www.kyivpost.com/post/75742
- RFE/RL: https://www.rferl.org/a/ukraine-russia-victory-day-cease-fire-drone-attacks/33752482.html

**OSINT X Accounts:** @RALee85, @GeoConfirmed, @OSINTtechnical, @WarMonitor3

---

## US / Iran

On May 8, 2026, the fragile US-Iran ceasefire — in place since April 8 — came under severe strain as CENTCOM and Iranian forces exchanged fire in the Strait of Hormuz for the second consecutive day. CENTCOM reported that three US Navy destroyers (USS Truxtun, USS Rafael Peralta, and USS Mason) were attacked by Iranian missiles, drones, and fast boats while transiting international waters; US forces intercepted the inbound threats and struck Iranian missile and drone launch sites, command-and-control nodes, and ISR facilities in retaliation. On the diplomatic front, Secretary of State Rubio stated publicly that the US expected a formal Iranian response to its 14-point peace memorandum, while Iranian officials said Tehran was still reviewing the proposal.

**Sources:**
- Al Jazeera: https://www.aljazeera.com/news/2026/5/8/what-we-know-about-irans-response-to-the-latest-us-ceasefire-proposal
- NPR: https://www.npr.org/2026/05/07/g-s1-120978/u-s-military-intercepted-iran-attacks-navy-ships-hormuz
- FDD: https://www.fdd.org/analysis/2026/05/08/iran-attacks-u-s-navy-vessels-transiting-strait-of-hormuz/
- Washington Post: https://www.washingtonpost.com/national-security/2026/05/07/us-strikes-iran-ceasefire/

**OSINT X Accounts:** @CENTCOM, @sentdefender, @ArmsControlWonk, @Osint613, @OSINTWarfare

---

_Generated: Sat, 09 May 2026 13:01:21 GMT | JBeck Cyber automated briefing_`;
