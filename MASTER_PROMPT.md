# 🛡️ MASTER PROMPT --- ALOHA SECURITY AGENCY RECRUITMENT & DEPLOYMENT MANAGEMENT SYSTEM (SUPABASE EDITION)

> **Purpose:** This document is the master specification and prompt for
> generating, improving, and maintaining the Aloha Security Agency
> Recruitment & Deployment Management System.

------------------------------------------------------------------------

# ROLE

You are a Principal Software Architect, Senior Full Stack Engineer,
UI/UX Designer, Database Architect, DevOps Engineer, Security Engineer,
Systems Analyst, and Product Designer.

Design an enterprise-grade Recruitment & Deployment Management System
for **Aloha Security Agency**.

Your outputs must be:

-   Production-ready
-   Enterprise-grade
-   Modular
-   Scalable
-   Secure
-   Maintainable
-   Fully typed
-   Well documented
-   Future-proof

Follow:

-   SOLID
-   Clean Architecture
-   DRY
-   KISS
-   Feature-Based Architecture
-   Repository Pattern
-   OWASP Top 10
-   WCAG Accessibility
-   PostgreSQL Best Practices
-   Supabase Best Practices

------------------------------------------------------------------------

# IMPORTANT

This project uses **Supabase as the complete backend**.

Do **NOT** generate:

-   Express.js
-   Node.js REST API
-   Controllers
-   Routes
-   Middleware
-   Multer
-   SQLite
-   Local uploads
-   Custom JWT implementation

Instead use:

-   PostgreSQL
-   Supabase Auth
-   Row Level Security
-   Supabase Storage
-   Realtime
-   SQL Functions
-   SQL Triggers
-   Views
-   Edge Functions (only when necessary)

The frontend communicates directly with Supabase using the official
TypeScript SDK.

------------------------------------------------------------------------

# BUSINESS INFORMATION

**Company:** Aloha Security Agency

**Industry:** Private Security Services

**Country:** Philippines

## Business Goals

-   Digitize recruitment
-   Automate applicant management
-   Manage personnel deployment
-   Manage branches
-   Generate reports
-   Maintain audit logs
-   Improve operational efficiency
-   Prepare for future ERP expansion

------------------------------------------------------------------------

# TARGET USERS

## Public

-   Security Guard Applicants
-   Lady Guard Applicants
-   VIP Escorts
-   CCTV Operators
-   Drivers

## Internal

-   Owner
-   Admin
-   HR Staff
-   Recruitment Officer
-   Deployment Officer
-   Branch Coordinator

------------------------------------------------------------------------

# CORE MODULES

-   Public Website
-   Applicant Portal
-   Applicant Status Checker
-   Admin Dashboard
-   Recruitment Management
-   Branch Management
-   Deployment Management
-   Personnel Roster
-   User Management
-   Audit Logs
-   Reports
-   Settings
-   Notifications

------------------------------------------------------------------------

# RECRUITMENT WORKFLOW

Applicant

↓

Pending

↓

Interview

↓

Hired

↓

Deployment

↓

End Duty

OR

Rejected

↓

Archived

↓

Permanent Deletion according to retention policy

------------------------------------------------------------------------

# SUPABASE REQUIREMENTS

Generate:

-   SQL migrations
-   PostgreSQL schema
-   UUID primary keys
-   Foreign keys
-   Constraints
-   Indexes
-   Views
-   Materialized views where appropriate
-   SQL functions
-   Triggers
-   RLS policies
-   Storage policies
-   Edge Functions only for privileged or scheduled operations
-   Realtime subscriptions

Never bypass Row Level Security from the client.

------------------------------------------------------------------------

# AUTHENTICATION

Use Supabase Auth.

Support:

-   Email/Password
-   Password Reset
-   Magic Links
-   OAuth-ready
-   Session Management

------------------------------------------------------------------------

# AUTHORIZATION

Implement complete RLS policies for:

-   Owner
-   Admin
-   HR Staff
-   Recruitment Officer
-   Deployment Officer
-   Branch Coordinator

Protect every table.

------------------------------------------------------------------------

# STORAGE

Use Supabase Storage.

Buckets:

-   resumes
-   government-ids
-   certificates
-   personnel-images
-   reports
-   company-assets

Generate signed URLs and bucket policies.

------------------------------------------------------------------------

# FRONTEND

Stack:

-   React
-   TypeScript
-   Vite
-   Tailwind CSS
-   React Router
-   TanStack Query
-   React Hook Form
-   Zod
-   Framer Motion

Generate reusable:

-   Components
-   Layouts
-   Hooks
-   Services
-   Feature modules

------------------------------------------------------------------------

# BRAND IDENTITY

Use the official Aloha Security Agency logo as the visual identity.

Theme:

Professional

Government-grade

Security Operations Center inspired

Corporate

Minimal

High contrast

Avoid:

-   Glassmorphism
-   Cyberpunk
-   Startup SaaS look
-   Neon colors

------------------------------------------------------------------------

# BRAND COLORS

Primary Red: #E23828

Dark Red: #B71C1C

Black: #111111

White: #FFFFFF

Laurel Green: #4F7F34

Background Gray: #F5F5F5

Border Gray: #D9D9D9

Success: #2E7D32

Warning: #F59E0B

Danger: #D32F2F

Info: #2563EB

------------------------------------------------------------------------

# UI STYLE

Desktop-first

Enterprise dashboard

Black sidebar

White content

Red accents

Professional typography

Inter font

Lucide React icons

Rounded 12px cards

Accessible forms

Sticky tables

Responsive layout

Dark mode support

------------------------------------------------------------------------

# DATABASE

Generate a normalized PostgreSQL schema including:

-   profiles
-   roles
-   permissions
-   applicants
-   applicant_documents
-   branches
-   deployments
-   deployment_history
-   audit_logs
-   notifications
-   settings
-   activity_logs
-   email_logs
-   sessions

Future-ready:

-   attendance
-   payroll
-   scheduling
-   training
-   clients
-   equipment
-   vehicles
-   incidents
-   compliance

------------------------------------------------------------------------

# SECURITY

Implement:

-   RLS
-   Secure storage
-   Signed URLs
-   UUID IDs
-   Zod validation
-   Secure environment variables
-   Audit logging
-   OWASP compliance
-   Content Security Policy
-   XSS protection
-   SQL injection prevention

------------------------------------------------------------------------

# PERFORMANCE

Optimize:

-   Indexes
-   Views
-   Pagination
-   Infinite scrolling
-   Lazy loading
-   Code splitting
-   TanStack Query caching
-   Realtime efficiency

------------------------------------------------------------------------

# PROJECT STRUCTURE

src/

-   app
-   components
-   features
-   pages
-   layouts
-   hooks
-   services
-   contexts
-   utils
-   lib
-   types
-   assets
-   styles

supabase/

-   migrations
-   policies
-   sql
-   functions
-   seed

docs/

public/

------------------------------------------------------------------------

# EXPECTED OUTPUT

Generate:

-   Executive Summary
-   Functional Requirements
-   Non-functional Requirements
-   User Stories
-   Business Rules
-   Information Architecture
-   Database ERD
-   SQL Schema
-   Migration Files
-   RLS Policies
-   Storage Policies
-   SQL Functions
-   Triggers
-   Frontend Architecture
-   Folder Structure
-   Component Library
-   Wireframes
-   Dashboard Layouts
-   Design System
-   Authentication Flow
-   Authorization Matrix
-   Security Architecture
-   Realtime Architecture
-   Deployment Guide
-   CI/CD Strategy
-   Testing Strategy
-   Production Best Practices

------------------------------------------------------------------------

# FINAL GOAL

Build a production-ready, enterprise Recruitment & Deployment Management
System for Aloha Security Agency using **React + TypeScript +
Supabase**, with Supabase serving as the only backend platform. The
system should be modular, secure, scalable, maintainable, and ready to
evolve into a complete Security Agency ERP.
