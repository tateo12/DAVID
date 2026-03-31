"use client";

import React, { useEffect, useState } from "react";
import { getSession, isTeamManager, type StoredSession } from "@/lib/session";

function EmployeeCurriculumView() {
  return (
    <section className="p-6 md:p-10 max-w-7xl w-full mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-outline-variant/10 pb-8">
        <div>
          <span className="font-label text-[0.6875rem] uppercase tracking-widest text-secondary-fixed mb-2 block">
            AI Training System v4.2
          </span>
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-white uppercase">
            AI Learning Path
          </h2>
          <p className="text-on-surface-variant max-w-2xl mt-2">
            Helping you use AI safely and effectively. Complete lessons to unlock new capabilities and tools.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-6 py-2 bg-primary-container text-white text-[0.6875rem] font-headline uppercase font-bold hover:opacity-90 transition-all flex items-center gap-2 rounded-sm">
            <span className="material-symbols-outlined text-sm">play_arrow</span>
            Continue Learning
          </button>
        </div>
      </div>

      {/* Progress Dashboard */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 bg-surface-container-low p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="font-label text-[0.6875rem] text-on-surface-variant mb-1">YOUR PROGRESS</p>
            <p className="font-headline text-3xl font-bold text-white">
              64.8<span className="text-secondary-fixed text-lg">%</span>
            </p>
          </div>
          <div className="flex-grow max-w-md">
            <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-secondary-fixed" style={{ width: "64.8%" }}></div>
            </div>
            <p className="text-[0.65rem] text-on-surface-variant mt-2 uppercase tracking-wide">
              Almost there! 3 lessons left to complete your current goal.
            </p>
          </div>
          <div className="text-right">
            <p className="font-label text-[0.6875rem] text-on-surface-variant mb-1">TIME SPENT</p>
            <p className="font-headline text-3xl font-bold text-white">
              12.5<span className="text-secondary-fixed text-lg">h</span>
            </p>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 bg-surface-container-high p-6 border-l-4 border-secondary-fixed">
          <p className="font-label text-[0.6875rem] text-secondary-fixed mb-1">CERTIFICATION STATUS</p>
          <p className="font-headline text-2xl font-bold text-white uppercase">Advanced Operator</p>
          <p className="text-[0.6875rem] text-on-surface-variant mt-1">2,400 POINTS UNTIL NEXT LEVEL</p>
        </div>
      </div>

      {/* Learning Units Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Unit 01 - Expanded State */}
        <div className="lg:col-span-2 bg-surface-container-high p-1 rounded-sm ring-1 ring-primary/30 shadow-2xl">
          <div className="p-5 flex justify-between items-start border-b border-outline-variant/15">
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-primary-container/20 flex items-center justify-center text-primary-container">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  security
                </span>
              </div>
              <div>
                <span className="font-label text-[0.6875rem] text-primary-container font-bold">UNIT 01</span>
                <h3 className="font-headline text-xl font-bold text-white">Protecting Against Bad Prompts</h3>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 bg-secondary-fixed/10 text-secondary-fixed text-[0.6rem] font-bold uppercase tracking-wider rounded-sm">
                In Progress
              </span>
              <span className="material-symbols-outlined text-white cursor-pointer">expand_less</span>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
                Learn how to spot and stop attempts to trick AI into doing things it shouldn&apos;t. We&apos;ll cover simple
                tricks and complex attacks.
              </p>
              <div className="space-y-3">
                <div className="p-3 mb-2 bg-surface-container-lowest border-l-2 border-primary-container flex items-center justify-between group cursor-pointer hover:bg-surface-bright transition-all">
                  <span className="font-label text-[0.75rem] text-white">1.1: Spotting Hidden Tricks</span>
                  <span
                    className="material-symbols-outlined text-sm text-secondary-fixed"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                </div>
                <div className="p-3 mb-2 bg-surface-container-lowest border-l-2 border-primary-container flex items-center justify-between group cursor-pointer hover:bg-surface-bright transition-all">
                  <div className="flex items-center gap-3">
                    <span className="font-label text-[0.75rem] text-white">1.2: Blocking AI Attacks</span>
                    <span className="px-2 py-0.5 bg-primary-container text-[0.55rem] font-bold uppercase rounded-full">
                      New
                    </span>
                  </div>
                  <button className="bg-secondary-fixed text-black px-3 py-1 text-[0.6rem] font-bold uppercase rounded-sm hover:opacity-90">
                    Start Learning
                  </button>
                </div>
                <div className="p-3 bg-surface-container-lowest border-l-2 border-outline-variant/30 flex items-center justify-between opacity-50">
                  <span className="font-label text-[0.75rem] text-on-surface-variant">
                    1.3: Advanced Safety Tactics
                  </span>
                  <span className="material-symbols-outlined text-sm">lock</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Unit 02 - Collapsed */}
        <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10 hover:border-primary-container/50 transition-all group cursor-pointer h-fit">
          <div className="flex justify-between items-start mb-6">
            <div className="w-10 h-10 bg-surface-container-high flex items-center justify-center text-outline group-hover:text-primary transition-colors">
              <span className="material-symbols-outlined">privacy_tip</span>
            </div>
            <span className="text-[0.6rem] font-headline font-bold text-on-surface-variant bg-surface-container-highest px-2 py-1">
              NOT STARTED
            </span>
          </div>
          <span className="font-label text-[0.6875rem] text-on-surface-variant">UNIT 02</span>
          <h3 className="font-headline text-lg font-bold text-white mb-2">Keeping Private Info Safe</h3>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            How to make sure personal details and private data don&apos;t end up in AI responses.
          </p>
          <div className="mt-6 flex items-center justify-between text-on-surface-variant">
            <span className="text-[0.6875rem] font-headline">5 MODULES</span>
            <span className="material-symbols-outlined">expand_more</span>
          </div>
        </div>

        {/* Unit 03 - Collapsed */}
        <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10 hover:border-primary-container/50 transition-all group cursor-pointer h-fit">
          <div className="flex justify-between items-start mb-6">
            <div className="w-10 h-10 bg-surface-container-high flex items-center justify-center text-outline group-hover:text-primary transition-colors">
              <span className="material-symbols-outlined">rule</span>
            </div>
            <span className="text-[0.6rem] font-headline font-bold text-on-surface-variant bg-surface-container-highest px-2 py-1">
              0% DONE
            </span>
          </div>
          <span className="font-label text-[0.6875rem] text-on-surface-variant">UNIT 03</span>
          <h3 className="font-headline text-lg font-bold text-white mb-2">Helping AI Stay on Track</h3>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Techniques to ensure the AI follows rules and doesn&apos;t get distracted by confusing requests.
          </p>
          <div className="mt-6 flex items-center justify-between text-on-surface-variant">
            <span className="text-[0.6875rem] font-headline">8 MODULES</span>
            <span className="material-symbols-outlined">expand_more</span>
          </div>
        </div>

        {/* Unit 04 - Collapsed */}
        <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10 hover:border-primary-container/50 transition-all group cursor-pointer h-fit">
          <div className="flex justify-between items-start mb-6">
            <div className="w-10 h-10 bg-surface-container-high flex items-center justify-center text-outline group-hover:text-primary transition-colors">
              <span className="material-symbols-outlined">hub</span>
            </div>
            <span className="text-[0.6rem] font-headline font-bold text-on-surface-variant bg-surface-container-highest px-2 py-1">
              0% DONE
            </span>
          </div>
          <span className="font-label text-[0.6875rem] text-on-surface-variant">UNIT 04</span>
          <h3 className="font-headline text-lg font-bold text-white mb-2">Checking Your Tools</h3>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Learning how to verify the safety of third-party apps and plugins connected to our AI.
          </p>
          <div className="mt-6 flex items-center justify-between text-on-surface-variant">
            <span className="text-[0.6875rem] font-headline">4 MODULES</span>
            <span className="material-symbols-outlined">expand_more</span>
          </div>
        </div>

        {/* Unit 05 - Locked */}
        <div className="bg-surface-container-lowest p-6 rounded-sm border border-outline-variant/5 opacity-50 relative group cursor-not-allowed">
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-background/80 backdrop-blur-sm p-4 border border-outline-variant/20 flex items-center gap-3">
              <span className="material-symbols-outlined text-outline">lock</span>
              <span className="font-headline text-[0.6875rem] font-black uppercase tracking-widest text-white">
                UNLOCK AT HIGHER LEVEL
              </span>
            </div>
          </div>
          <div className="flex justify-between items-start mb-6">
            <div className="w-10 h-10 bg-surface-container-low flex items-center justify-center text-outline">
              <span className="material-symbols-outlined">analytics</span>
            </div>
          </div>
          <span className="font-label text-[0.6875rem] text-on-surface-variant">UNIT 05</span>
          <h3 className="font-headline text-lg font-bold text-white mb-2">Real-time AI Monitoring</h3>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Advanced tools for watching how AI behaves in real-time as people use it.
          </p>
          <div className="mt-6 flex items-center justify-between text-on-surface-variant">
            <span className="text-[0.6875rem] font-headline">12 MODULES</span>
            <span className="material-symbols-outlined">expand_more</span>
          </div>
        </div>
      </div>

      {/* Footer Notes */}
      <div className="grid grid-cols-12 gap-8 border-t border-outline-variant/10 pt-10">
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <h4 className="font-headline text-sm font-black uppercase tracking-widest text-white">
            Learning Tips
          </h4>
          <div className="bg-surface-container-lowest p-4 font-label text-[0.75rem] text-on-surface-variant leading-relaxed border-l border-primary-container">
            &quot;Remember to check back every week. New lessons are added as AI technology changes. If you have questions
            about a specific lesson, reach out to your manager or the AI safety team.&quot;
          </div>
        </div>
        <div className="col-span-12 lg:col-span-8 overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-headline text-sm font-black uppercase tracking-widest text-white">
              Your Training Activity
            </h4>
            <span className="font-headline text-[0.6rem] text-secondary-fixed">● ACTIVE SESSION</span>
          </div>
          <div className="bg-[#0c0e11] p-4 font-['Space_Grotesk'] text-[0.65rem] text-on-surface-variant space-y-1">
            <div className="flex gap-4">
              <span className="text-[#5D5FEF] w-20">[TODAY]</span>
              <span className="text-white w-20">USER:</span>
              <span>Started Lesson 1.2 &quot;Blocking AI Attacks&quot;</span>
            </div>
            <div className="flex gap-4">
              <span className="text-[#5D5FEF] w-20">[YESTERDAY]</span>
              <span className="text-white w-20">SYSTEM:</span>
              <span>Completed Unit 01 Quiz - Score: 92%</span>
            </div>
            <div className="flex gap-4">
              <span className="text-[#5D5FEF] w-20">[MON]</span>
              <span className="text-secondary-fixed w-20">MANAGER:</span>
              <span>Assigned Unit 02 to your dashboard.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ManagerCurriculumView() {
  return (
    <section className="p-6 md:p-10 max-w-7xl w-full mx-auto space-y-8">
      {/* Hero Section with Stats */}
      <div className="mb-10 grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 p-8 bg-surface-container-low rounded-lg flex flex-col justify-between border-l-4 border-primary-container relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="font-headline text-3xl font-bold text-white tracking-tight">Active Curriculum Deployment</h2>
            <p className="text-on-surface-variant mt-2 max-w-xl text-sm leading-relaxed">
              Manage and distribute safety protocols across the organization. Monitor real-time completion rates and
              identify knowledge gaps in high-risk departments.
            </p>
          </div>
          <div className="mt-8 flex gap-12 relative z-10">
            <div>
              <p className="font-label text-[10px] uppercase tracking-[0.1em] text-outline">Total Modules</p>
              <p className="font-headline text-4xl font-bold text-white">12</p>
            </div>
            <div>
              <p className="font-label text-[10px] uppercase tracking-[0.1em] text-outline">Active Assignments</p>
              <p className="font-headline text-4xl font-bold text-secondary-fixed">450</p>
            </div>
            <div>
              <p className="font-label text-[10px] uppercase tracking-[0.1em] text-outline">Completion Rate</p>
              <p className="font-headline text-4xl font-bold text-white">68%</p>
            </div>
          </div>
          {/* Decorative background elements */}
          <div className="absolute right-0 top-0 w-64 h-full opacity-10 pointer-events-none">
            <span
              className="material-symbols-outlined text-[180px] text-primary rotate-12"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              shield_with_heart
            </span>
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4 p-6 bg-surface-container-high rounded-lg flex flex-col justify-center border border-outline-variant/10">
          <h3 className="font-label text-[11px] uppercase tracking-widest text-secondary-fixed mb-4">Security Notice</h3>
          <div className="p-4 bg-surface-container-lowest rounded space-y-3">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-error text-lg">warning</span>
              <p className="text-xs text-on-surface-variant font-body">
                Engineering Team requires immediate retraining on{" "}
                <span className="text-white font-bold">Unit 04: Prompt Injection Defense</span>.
              </p>
            </div>
            <button className="text-[10px] font-label uppercase font-bold text-primary-container hover:text-primary transition-colors flex items-center gap-1">
              Review Incident Logs <span className="material-symbols-outlined text-xs">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>

      {/* Unit Blocks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Unit 01 */}
        <div className="bg-surface-container-low p-5 rounded-lg group hover:bg-surface-container-high transition-all duration-300 border border-transparent hover:border-outline-variant/30 flex flex-col h-full">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-surface-container-lowest rounded-sm flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-2xl">safety_check</span>
            </div>
            <span className="font-label text-[10px] px-2 py-1 bg-secondary-fixed/10 text-secondary-fixed rounded uppercase">
              Mandatory
            </span>
          </div>
          <h3 className="font-headline text-lg font-bold text-white leading-tight mb-3">Unit 01: Core AI Safety</h3>
          <p className="text-on-surface-variant text-sm mb-8 flex-grow">
            Foundational principles of interacting with internal LLMs safely without leaking proprietary logic.
          </p>
          <div className="pt-6 border-t border-outline-variant/10 space-y-3">
            <p className="font-label text-[10px] text-outline uppercase mb-2">Assign To Group</p>
            <select className="w-full bg-surface-container-highest border-none rounded-sm text-xs font-label focus:ring-1 focus:ring-secondary-fixed mb-4">
              <option>Engineering Team</option>
              <option>Marketing</option>
              <option>All Employees</option>
              <option>Custom Selection...</option>
            </select>
            <div className="flex gap-2">
              <button className="flex-1 py-2 text-[10px] font-label flex items-center justify-center font-bold uppercase border border-outline-variant/30 hover:bg-surface-container-lowest transition-colors rounded-sm">
                Overview
              </button>
              <button className="flex-1 py-2 text-[10px] font-label flex items-center justify-center font-bold uppercase bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed-dim transition-colors rounded-sm">
                Assign
              </button>
            </div>
          </div>
        </div>

        {/* Unit 02 */}
        <div className="bg-surface-container-low p-5 rounded-lg group hover:bg-surface-container-high transition-all duration-300 border border-transparent hover:border-outline-variant/30 flex flex-col h-full">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-surface-container-lowest rounded-sm flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-2xl">visibility_off</span>
            </div>
            <span className="font-label text-[10px] px-2 py-1 bg-primary-container/10 text-primary rounded uppercase">
              Data Privacy
            </span>
          </div>
          <h3 className="font-headline text-lg font-bold text-white leading-tight mb-3">Unit 02: PII Redaction</h3>
          <p className="text-on-surface-variant text-sm mb-8 flex-grow">
            Techniques and policies for identifying and stripping personally identifiable information from training
            sets.
          </p>
          <div className="pt-6 border-t border-outline-variant/10 space-y-3">
            <p className="font-label text-[10px] text-outline uppercase mb-2">Assign To Group</p>
            <select className="w-full bg-surface-container-highest border-none rounded-sm text-xs font-label focus:ring-1 focus:ring-secondary-fixed mb-4">
              <option>Marketing</option>
              <option>Engineering Team</option>
              <option>All Employees</option>
              <option>Custom Selection...</option>
            </select>
            <div className="flex gap-2">
              <button className="flex-1 py-2 text-[10px] font-label flex items-center justify-center font-bold uppercase border border-outline-variant/30 hover:bg-surface-container-lowest transition-colors rounded-sm">
                Overview
              </button>
              <button className="flex-1 py-2 text-[10px] font-label flex items-center justify-center font-bold uppercase bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed-dim transition-colors rounded-sm">
                Assign
              </button>
            </div>
          </div>
        </div>

        {/* Unit 03 */}
        <div className="bg-surface-container-low p-5 rounded-lg group hover:bg-surface-container-high transition-all duration-300 border border-transparent hover:border-outline-variant/30 flex flex-col h-full">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-surface-container-lowest rounded-sm flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-2xl">verified_user</span>
            </div>
            <span className="font-label text-[10px] px-2 py-1 bg-secondary-fixed/10 text-secondary-fixed rounded uppercase">
              Compliance
            </span>
          </div>
          <h3 className="font-headline text-lg font-bold text-white leading-tight mb-3">Unit 03: Compliance Ethics</h3>
          <p className="text-on-surface-variant text-sm mb-8 flex-grow">
            A guide to navigating international AI regulations and internal ethical guidelines for model output.
          </p>
          <div className="pt-6 border-t border-outline-variant/10 space-y-3">
            <p className="font-label text-[10px] text-outline uppercase mb-2">Assign To Group</p>
            <select className="w-full bg-surface-container-highest border-none rounded-sm text-xs font-label focus:ring-1 focus:ring-secondary-fixed mb-4">
              <option>All Employees</option>
              <option>Engineering Team</option>
              <option>Marketing</option>
              <option>Custom Selection...</option>
            </select>
            <div className="flex gap-2">
              <button className="flex-1 py-2 text-[10px] font-label flex items-center justify-center font-bold uppercase border border-outline-variant/30 hover:bg-surface-container-lowest transition-colors rounded-sm">
                Overview
              </button>
              <button className="flex-1 py-2 text-[10px] font-label flex items-center justify-center font-bold uppercase bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed-dim transition-colors rounded-sm">
                Assign
              </button>
            </div>
          </div>
        </div>

        {/* Unit 04 */}
        <div className="bg-surface-container-low p-5 rounded-lg group hover:bg-surface-container-high transition-all duration-300 border border-transparent hover:border-outline-variant/30 flex flex-col h-full">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 bg-surface-container-lowest rounded-sm flex items-center justify-center text-error">
              <span className="material-symbols-outlined text-2xl">terminal</span>
            </div>
            <span className="font-label text-[10px] px-2 py-1 bg-error/10 text-error rounded uppercase font-bold">
              Critical
            </span>
          </div>
          <h3 className="font-headline text-lg font-bold text-white leading-tight mb-3">Unit 04: Injection Defense</h3>
          <p className="text-on-surface-variant text-sm mb-8 flex-grow">
            Advanced defensive measures against prompt injection attacks and malicious jailbreaking attempts.
          </p>
          <div className="pt-6 border-t border-outline-variant/10 space-y-3">
            <p className="font-label text-[10px] text-outline uppercase mb-2">Assign To Group</p>
            <select className="w-full bg-surface-container-highest border-none rounded-sm text-xs font-label focus:ring-1 focus:ring-secondary-fixed mb-4">
              <option>Engineering Team</option>
              <option>Marketing</option>
              <option>All Employees</option>
              <option>Custom Selection...</option>
            </select>
            <div className="flex gap-2">
              <button className="flex-1 py-2 text-[10px] font-label flex items-center justify-center font-bold uppercase border border-outline-variant/30 hover:bg-surface-container-lowest transition-colors rounded-sm">
                Overview
              </button>
              <button className="flex-1 py-2 text-[10px] font-label flex items-center justify-center font-bold uppercase bg-secondary-container text-on-secondary-container hover:bg-secondary-fixed-dim transition-colors rounded-sm">
                Assign
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Table Section */}
      <div className="mt-12 bg-surface-container-low rounded-lg p-6 border border-outline-variant/10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h4 className="font-headline font-bold text-white">Recent Assignment Status</h4>
            <p className="text-xs text-on-surface-variant">Live telemetry from currently active learning paths.</p>
          </div>
          <button className="text-xs font-label text-primary font-bold uppercase tracking-wider hover:underline">
            Export Report
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className="pb-4 font-label text-[10px] uppercase text-outline px-2">Assignee</th>
                <th className="pb-4 font-label text-[10px] uppercase text-outline px-2">Unit</th>
                <th className="pb-4 font-label text-[10px] uppercase text-outline px-2">Status</th>
                <th className="pb-4 font-label text-[10px] uppercase text-outline px-2">Score</th>
                <th className="pb-4 font-label text-[10px] uppercase text-outline text-right px-2">Timestamp</th>
              </tr>
            </thead>
            <tbody className="text-xs font-body">
              <tr className="border-b border-outline-variant/5 hover:bg-surface-container-high transition-colors">
                <td className="py-4 px-2 text-white font-medium">David K. (Engineering)</td>
                <td className="py-4 px-2 text-on-surface-variant">Unit 04: Injection Defense</td>
                <td className="py-4 px-2">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-secondary-fixed"></span> Completed
                  </span>
                </td>
                <td className="py-4 px-2 text-white">98%</td>
                <td className="py-4 px-2 text-on-surface-variant text-right">02 MIN AGO</td>
              </tr>
              <tr className="border-b border-outline-variant/5 hover:bg-surface-container-high transition-colors">
                <td className="py-4 px-2 text-white font-medium">Sarah L. (Marketing)</td>
                <td className="py-4 px-2 text-on-surface-variant">Unit 02: PII Redaction</td>
                <td className="py-4 px-2">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span> In Progress
                  </span>
                </td>
                <td className="py-4 px-2 text-on-surface-variant">--</td>
                <td className="py-4 px-2 text-on-surface-variant text-right">15 MIN AGO</td>
              </tr>
              <tr className="hover:bg-surface-container-high transition-colors">
                <td className="py-4 px-2 text-white font-medium">Marcus J. (Ops)</td>
                <td className="py-4 px-2 text-on-surface-variant">Unit 01: Core AI Safety</td>
                <td className="py-4 px-2">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-error"></span> Failed
                  </span>
                </td>
                <td className="py-4 px-2 text-error">42%</td>
                <td className="py-4 px-2 text-on-surface-variant text-right">1 HOUR AGO</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-16 pt-8 border-t border-outline-variant/10">
        <div className="mb-8">
            <span className="font-label text-[0.6875rem] uppercase tracking-widest text-secondary-fixed mb-2 block">Manager Learning Context</span>
            <h2 className="font-headline text-3xl font-bold text-white uppercase">Your Personal Growth</h2>
            <p className="text-on-surface-variant text-sm mt-2">Access the same curriculum your team sees to continue your own security education.</p>
        </div>
        <div className="bg-surface-container-lowest -mx-6 md:-mx-10 px-6 md:px-10 py-10 border-y border-outline-variant/5">
            <EmployeeCurriculumView />
        </div>
      </div>
    </section>
  );
}

export default function CurriculumPage() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSession(getSession());
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center text-on-surface-variant text-sm font-mono animate-pulse">
        Initializing Command Interface...
      </div>
    );
  }

  const isManager = session && isTeamManager(session.user?.role ?? "");

  return (
    <div className="w-full">
      {isManager ? <ManagerCurriculumView /> : <EmployeeCurriculumView />}
    </div>
  );
}
