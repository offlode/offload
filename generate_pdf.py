#!/usr/bin/env python3
"""Generate the Offload Platform — Complete Audit & Feature Inventory PDF."""

import urllib.request
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable, KeepTogether, ListFlowable, ListItem
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, black, Color
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics

# ── Font setup ──────────────────────────────────────────────────────
FONT_DIR = Path("/tmp/fonts")
FONT_DIR.mkdir(exist_ok=True)

# Download Inter variable font (single file, default weight instance)
INTER_VF_URL = "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
INTER_VF_PATH = FONT_DIR / "Inter-Variable.ttf"
if not INTER_VF_PATH.exists():
    urllib.request.urlretrieve(INTER_VF_URL, INTER_VF_PATH)

# Register under multiple names (variable font defaults to regular weight)
for alias in ["Inter", "Inter-Bold", "Inter-SemiBold", "Inter-Medium"]:
    pdfmetrics.registerFont(TTFont(alias, str(INTER_VF_PATH)))

# ── Colors ──────────────────────────────────────────────────────────
VIOLET = HexColor("#7C5CFC")
VIOLET_DARK = HexColor("#5A3ED9")
VIOLET_LIGHT = HexColor("#EDE8FF")
DARK_BG = HexColor("#1A1625")
DARK_SURFACE = HexColor("#231E30")
TEXT_PRIMARY = HexColor("#1A1A1A")
TEXT_SECONDARY = HexColor("#555555")
TEXT_MUTED = HexColor("#888888")
WHITE = white
CRITICAL_RED = HexColor("#DC2626")
HIGH_ORANGE = HexColor("#EA580C")
MEDIUM_AMBER = HexColor("#D97706")
LOW_BLUE = HexColor("#2563EB")
ROW_ALT = HexColor("#F8F7FC")
BORDER_LIGHT = HexColor("#E0DDE8")
GREEN_SUCCESS = HexColor("#16A34A")
YELLOW_PARTIAL = HexColor("#CA8A04")
GRAY_STUB = HexColor("#6B7280")

# ── Page constants ──────────────────────────────────────────────────
W, H = letter
MARGIN_LEFT = 54
MARGIN_RIGHT = 54
MARGIN_TOP = 54
MARGIN_BOTTOM = 60
CONTENT_W = W - MARGIN_LEFT - MARGIN_RIGHT

# ── Styles ──────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

s_title = ParagraphStyle("DocTitle", fontName="Inter-Bold", fontSize=26, leading=32,
                         textColor=WHITE, spaceAfter=4, alignment=TA_LEFT)
s_subtitle = ParagraphStyle("DocSubtitle", fontName="Inter-Medium", fontSize=12, leading=16,
                            textColor=HexColor("#C4B8FF"), spaceAfter=2, alignment=TA_LEFT)
s_part_title = ParagraphStyle("PartTitle", fontName="Inter-Bold", fontSize=20, leading=26,
                              textColor=VIOLET, spaceBefore=16, spaceAfter=10)
s_h1 = ParagraphStyle("H1", fontName="Inter-Bold", fontSize=15, leading=20,
                       textColor=TEXT_PRIMARY, spaceBefore=18, spaceAfter=6)
s_h2 = ParagraphStyle("H2", fontName="Inter-SemiBold", fontSize=12, leading=16,
                       textColor=TEXT_PRIMARY, spaceBefore=12, spaceAfter=4)
s_h3 = ParagraphStyle("H3", fontName="Inter-SemiBold", fontSize=10.5, leading=14,
                       textColor=VIOLET_DARK, spaceBefore=8, spaceAfter=3)
s_body = ParagraphStyle("Body", fontName="Inter", fontSize=9, leading=13,
                        textColor=TEXT_PRIMARY, spaceAfter=4)
s_body_small = ParagraphStyle("BodySmall", fontName="Inter", fontSize=8, leading=11,
                              textColor=TEXT_SECONDARY, spaceAfter=3)
s_bullet = ParagraphStyle("Bullet", fontName="Inter", fontSize=9, leading=13,
                          textColor=TEXT_PRIMARY, spaceAfter=2, leftIndent=16, bulletIndent=6)
s_code = ParagraphStyle("Code", fontName="Courier", fontSize=7.5, leading=10,
                        textColor=HexColor("#333333"), spaceAfter=2, leftIndent=16,
                        backColor=HexColor("#F5F3FF"))
s_table_header = ParagraphStyle("TH", fontName="Inter-Bold", fontSize=8, leading=11,
                                textColor=WHITE, alignment=TA_LEFT)
s_table_cell = ParagraphStyle("TC", fontName="Inter", fontSize=8, leading=11,
                              textColor=TEXT_PRIMARY, alignment=TA_LEFT)
s_table_cell_sm = ParagraphStyle("TCSm", fontName="Inter", fontSize=7.5, leading=10,
                                 textColor=TEXT_PRIMARY, alignment=TA_LEFT)
s_badge_critical = ParagraphStyle("BadgeCrit", fontName="Inter-Bold", fontSize=7.5,
                                  leading=10, textColor=CRITICAL_RED)
s_badge_high = ParagraphStyle("BadgeHigh", fontName="Inter-Bold", fontSize=7.5,
                              leading=10, textColor=HIGH_ORANGE)
s_badge_medium = ParagraphStyle("BadgeMed", fontName="Inter-Bold", fontSize=7.5,
                                leading=10, textColor=MEDIUM_AMBER)
s_badge_low = ParagraphStyle("BadgeLow", fontName="Inter-Bold", fontSize=7.5,
                             leading=10, textColor=LOW_BLUE)
s_works = ParagraphStyle("Works", fontName="Inter-Bold", fontSize=8, leading=11,
                         textColor=GREEN_SUCCESS)
s_partial = ParagraphStyle("Partial", fontName="Inter-Bold", fontSize=8, leading=11,
                           textColor=YELLOW_PARTIAL)
s_stub = ParagraphStyle("Stub", fontName="Inter-Bold", fontSize=8, leading=11,
                        textColor=GRAY_STUB)
s_toc = ParagraphStyle("TOC", fontName="Inter-Medium", fontSize=10, leading=15,
                       textColor=VIOLET_DARK, spaceAfter=3, leftIndent=8)
s_toc_sub = ParagraphStyle("TOCSub", fontName="Inter", fontSize=9, leading=13,
                           textColor=TEXT_SECONDARY, spaceAfter=2, leftIndent=24)
s_footer = ParagraphStyle("Footer", fontName="Inter", fontSize=7, leading=9,
                          textColor=TEXT_MUTED)

# ── Helpers ──────────────────────────────────────────────────────────
def header_footer(canvas_obj, doc):
    """Draw page number footer on every page."""
    canvas_obj.saveState()
    canvas_obj.setFont("Inter", 7)
    canvas_obj.setFillColor(TEXT_MUTED)
    canvas_obj.drawString(MARGIN_LEFT, 28, "Offload Platform — Complete Audit & Feature Inventory")
    canvas_obj.drawRightString(W - MARGIN_RIGHT, 28, f"Page {doc.page}")
    # Thin line above footer
    canvas_obj.setStrokeColor(BORDER_LIGHT)
    canvas_obj.setLineWidth(0.5)
    canvas_obj.line(MARGIN_LEFT, 40, W - MARGIN_RIGHT, 40)
    canvas_obj.restoreState()

def first_page(canvas_obj, doc):
    """Draw the cover header band on first page."""
    canvas_obj.saveState()
    # Dark band
    canvas_obj.setFillColor(DARK_BG)
    canvas_obj.rect(0, H - 160, W, 160, fill=1, stroke=0)
    # Accent line
    canvas_obj.setFillColor(VIOLET)
    canvas_obj.rect(0, H - 164, W, 4, fill=1, stroke=0)
    canvas_obj.restoreState()
    header_footer(canvas_obj, doc)

def sev_style(sev):
    m = {"CRITICAL": s_badge_critical, "HIGH": s_badge_high,
         "MEDIUM": s_badge_medium, "LOW": s_badge_low}
    return m.get(sev, s_table_cell)

def status_style(st):
    m = {"WORKS": s_works, "PARTIAL": s_partial, "STUB": s_stub}
    return m.get(st, s_table_cell)

def make_bug_table(bugs, col_widths=None):
    """Create a styled table for bug lists.
    bugs: list of (severity, file, description, impact)
    """
    if not col_widths:
        col_widths = [52, 105, 195, 150]
    header = [
        Paragraph("Severity", s_table_header),
        Paragraph("File / Location", s_table_header),
        Paragraph("Bug Description", s_table_header),
        Paragraph("Impact", s_table_header),
    ]
    rows = [header]
    for sev, file, desc, impact in bugs:
        rows.append([
            Paragraph(sev, sev_style(sev)),
            Paragraph(file, s_table_cell_sm),
            Paragraph(desc, s_table_cell_sm),
            Paragraph(impact, s_table_cell_sm),
        ])
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), DARK_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Inter-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER_LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(rows)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    t.setStyle(TableStyle(style_cmds))
    return t

def make_feature_table(features, col_widths=None):
    """features: list of (feature_name, status, notes)"""
    if not col_widths:
        col_widths = [160, 55, 287]
    header = [
        Paragraph("Feature", s_table_header),
        Paragraph("Status", s_table_header),
        Paragraph("Notes", s_table_header),
    ]
    rows = [header]
    for name, status, notes in features:
        rows.append([
            Paragraph(name, s_table_cell_sm),
            Paragraph(status, status_style(status)),
            Paragraph(notes, s_table_cell_sm),
        ])
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), DARK_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Inter-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER_LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(rows)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    t.setStyle(TableStyle(style_cmds))
    return t

def divider():
    return HRFlowable(width="100%", thickness=0.5, color=BORDER_LIGHT,
                      spaceBefore=8, spaceAfter=8)

def esc(text):
    """Escape XML-sensitive characters for Paragraph."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

# ── Build Document ──────────────────────────────────────────────────
OUTPUT = "/home/user/workspace/offload/offload-audit-and-inventory.pdf"
doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=letter,
    title="Offload Platform — Complete Audit & Feature Inventory",
    author="Perplexity Computer",
    leftMargin=MARGIN_LEFT,
    rightMargin=MARGIN_RIGHT,
    topMargin=MARGIN_TOP,
    bottomMargin=MARGIN_BOTTOM,
)

story = []

# ═══════════════════════════════════════════════════════════════════
# COVER / TITLE SECTION (positioned in top dark band via first_page callback)
# ═══════════════════════════════════════════════════════════════════
story.append(Spacer(1, 6))
story.append(Paragraph("Offload Platform", s_title))
story.append(Paragraph("Complete Audit &amp; Feature Inventory", ParagraphStyle(
    "TitleLine2", fontName="Inter-SemiBold", fontSize=18, leading=24, textColor=VIOLET_LIGHT)))
story.append(Spacer(1, 8))
story.append(Paragraph("Laundry Logistics Platform  ·  Comprehensive Bug Report + Full Feature Catalog", s_subtitle))
story.append(Spacer(1, 30))

# Summary stats box
summary_data = [
    [Paragraph("<b>Total Bugs Found</b>", s_table_cell),
     Paragraph("<b>88 endpoints</b>", s_table_cell),
     Paragraph("<b>43 page files</b>", s_table_cell),
     Paragraph("<b>~4,200 lines backend</b>", s_table_cell)],
    [Paragraph("~80 issues across 4 audits", s_table_cell_sm),
     Paragraph("All /api/ prefixed", s_table_cell_sm),
     Paragraph("React + TypeScript", s_table_cell_sm),
     Paragraph("Express + Drizzle ORM", s_table_cell_sm)],
]
summary_t = Table(summary_data, colWidths=[CONTENT_W/4]*4)
summary_t.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), VIOLET_LIGHT),
    ("GRID", (0, 0), (-1, -1), 0.4, BORDER_LIGHT),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
]))
story.append(summary_t)
story.append(Spacer(1, 14))

# TABLE OF CONTENTS
story.append(Paragraph("Contents", s_h1))
story.append(divider())
toc_items = [
    ("Part 1: Bug Audit Report", [
        "1.1  Critical Priority — App crashes, security holes, data corruption",
        "1.2  High Priority — Broken features, wrong data, dead functionality",
        "1.3  Medium Priority — Stubs, incomplete features, inconsistent behavior",
        "1.4  Low Priority — Cosmetic issues, unused code, minor UX",
    ]),
    ("Part 2: Complete Feature Inventory", [
        "2.1  Login &amp; Authentication",
        "2.2  Customer Side (Marta demo)",
        "2.3  Driver Side (Peter demo)",
        "2.4  Staff / Laundromat Side (Maria demo)",
        "2.5  Manager Side",
        "2.6  Admin Side",
        "2.7  Backend Engines &amp; Systems",
        "2.8  Data Model &amp; Technical Stack",
        "2.9  Feature Status Matrix — Works vs Partial vs Stub",
    ]),
]
for section, subs in toc_items:
    story.append(Paragraph(section, s_toc))
    for sub in subs:
        story.append(Paragraph(sub, s_toc_sub))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════
# PART 1: BUG AUDIT REPORT
# ═══════════════════════════════════════════════════════════════════
story.append(Paragraph("PART 1: BUG AUDIT REPORT", s_part_title))
story.append(Paragraph(
    "Compiled from four audit files covering customer pages, driver/staff/manager pages, "
    "admin pages, and backend (routes, storage, schema). Bugs are organized into four priority tiers.",
    s_body))
story.append(divider())

# ── CRITICAL ────────────────────────────────────────────────────────
story.append(Paragraph("1.1  CRITICAL — App Crashes, Security Holes, Data Corruption", s_h1))
story.append(Paragraph(
    "Issues that represent immediate security vulnerabilities, runtime crashes, or data integrity failures. "
    "These must be fixed before any production deployment.", s_body))
story.append(Spacer(1, 6))

critical_bugs = [
    ("CRITICAL", "server/routes.ts (all routes)", "No authentication middleware used anywhere — requireAuth() is defined but never called on any of the 88 endpoints", "Any anonymous user can access admin financials, modify user data, create promo codes, or read PII"),
    ("CRITICAL", "storage.ts, routes.ts login/register", "Plaintext password storage — passwords stored and compared as raw strings, no hashing (bcrypt/argon2)", "Full credential exposure if DB is leaked; trivial account takeover"),
    ("CRITICAL", "routes.ts PATCH /api/users/:id", "Role escalation — endpoint passes req.body directly to updateUser() with no field whitelist; any user can set role to 'admin'", "Complete privilege escalation; any customer becomes admin"),
    ("CRITICAL", "routes.ts GET/PATCH /api/users/:id", "Unrestricted user profile read/write — no ownership or role check on user data endpoints", "Any caller reads any user's phone, email, loyalty points, or overwrites any user's profile"),
    ("CRITICAL", "routes.ts GET /api/orders, GET /api/orders/:id", "Unrestricted order data access — no auth/ownership verification on order queries", "Any caller reads full order history including driver/customer phone numbers for any user"),
    ("CRITICAL", "routes.ts DELETE /api/addresses/:id, DELETE /api/payment-methods/:id", "Unrestricted deletion — no ownership verification on address and payment method delete endpoints", "Any caller can delete any user's saved addresses or payment methods by ID"),
    ("CRITICAL", "routes.ts /api/admin/* (lines 3221-4006)", "All admin endpoints exposed without authentication — metrics, financials, user list, fraud scan, promo management all public", "Full platform data exposure; attackers can create promos, view all PII, manipulate payouts"),
    ("CRITICAL", "profile.tsx, addresses.tsx, payments.tsx", "All customer pages hardcoded to userId=1 — useAuth() never imported; every customer sees and modifies user #1's data", "Data corruption: all customers share one user's profile, addresses, and payment methods"),
    ("CRITICAL", "profile.tsx (lines 581-590)", "Sign-out does not call logout() from auth context — only navigates to '/' without clearing session", "User remains authenticated after 'signing out'; can navigate back to protected pages"),
]
story.append(make_bug_table(critical_bugs))
story.append(Spacer(1, 4))
story.append(Paragraph(f"<b>{len(critical_bugs)} critical issues identified</b>", s_body))

story.append(PageBreak())

# ── HIGH ────────────────────────────────────────────────────────────
story.append(Paragraph("1.2  HIGH — Broken Features, Wrong Data, Dead Functionality", s_h1))
story.append(Paragraph(
    "Issues that break core features, display wrong information, or cause functionality to silently fail.", s_body))
story.append(Spacer(1, 6))

high_bugs = [
    ("HIGH", "driver/dashboard.tsx, earnings.tsx, availability.tsx, route.tsx", "Rules of Hooks violation — conditional return before useQuery hooks; React will throw 'Rendered more/fewer hooks' error", "All 4 driver pages crash at runtime when auth state changes"),
    ("HIGH", "driver/navigation.tsx (lines 9-37)", "Wrong delivery address — getNavigationTarget() always returns pickupAddress even for delivery stops (ready_for_delivery, out_for_delivery)", "Driver navigated to wrong address when delivering; Google Maps link points to pickup instead of delivery location"),
    ("HIGH", "routes.ts GET /api/drivers/user/:userId", "Route shadowed — registered after /api/drivers/:id so Express matches 'user' as :id parameter, returning 404", "Frontend calls to get driver by userId always fail; driver profile lookups broken"),
    ("HIGH", "routes.ts PATCH /api/orders/:id", "Unrestricted field overwrites — any caller can overwrite total, paymentStatus, status, vendorPayout, loyaltyPointsEarned on any order", "Financial data corruption; order amounts and payout figures can be manipulated"),
    ("HIGH", "routes.ts calculatePayouts() (line 203)", "Vendor payoutRate field ignored — always uses hardcoded 0.65 (65%) regardless of vendor's configured rate", "Vendors with negotiated rates get wrong payouts; financial reporting inaccurate"),
    ("HIGH", "routes.ts processPaymentCapture() (line 208)", "Uses stale order data — called with original order object before updateData is applied; recalculates payouts from pre-update subtotal", "Vendor/driver payouts calculated on stale amounts; consent-based charges not reflected"),
    ("HIGH", "routes.ts JSON.parse without try/catch (lines 84-85)", "scoreVendor() parses order.preferences and vendor.capabilities without try/catch — malformed JSON crashes order creation", "Every new order fails if any vendor has malformed capabilities JSON in DB"),
    ("HIGH", "routes.ts (88 endpoints)", "Only 4 try/catch blocks for 88 endpoints — any DB failure or null dereference returns Express 500 with stack trace", "Unhandled errors expose server internals; cascading failures across all endpoints"),
    ("HIGH", "routes.ts POST /api/drivers (line 1887-1900)", "Hardcoded default password 'driver123' for all driver accounts — no forced password change mechanism", "All driver accounts have a known password; trivial unauthorized access"),
    ("HIGH", "admin/orders.tsx (line 108)", "JSON.parse(order.bags) unguarded — malformed JSON crashes OrderRow component and propagates to error boundary", "Admin orders page becomes unusable if any order has invalid bags JSON"),
    ("HIGH", "admin/promos.tsx (line 231)", "Edit dialog uses defaultValue (uncontrolled) on Select — switching between promos doesn't update type dropdown visually", "Admin sees wrong promo type when editing different promos; data entry errors"),
    ("HIGH", "order-detail.tsx (lines 853-862)", "Support dialog submits no API request — message collected but onClick only closes dialog; support message silently discarded", "Customer thinks support was contacted but message is lost; no support tickets created"),
]
story.append(make_bug_table(high_bugs))
story.append(Spacer(1, 4))
story.append(Paragraph(f"<b>{len(high_bugs)} high-priority issues identified</b>", s_body))

story.append(PageBreak())

# ── MEDIUM ──────────────────────────────────────────────────────────
story.append(Paragraph("1.3  MEDIUM — Stubs, Incomplete Features, Inconsistent Behavior", s_h1))
story.append(Paragraph(
    "Features that partially work, have missing backend logic, or exhibit inconsistent behavior across the platform.", s_body))
story.append(Spacer(1, 6))

medium_bugs = [
    ("MEDIUM", "orders.tsx / order-detail.tsx", "CANCELLABLE status list inconsistency — orders.tsx excludes 'pickup_in_progress' but order-detail.tsx includes it", "Cancel button appears on detail page but not in list for same order status"),
    ("MEDIUM", "schedule.tsx (lines 153-158)", "No address validation before submit — selectedAddressId can be null; server returns 400 but user gets generic error", "Users with no saved addresses see confusing error instead of prompt to add one"),
    ("MEDIUM", "driver/availability.tsx", "Schedule preferences (days/time range) never saved to API — only status, zones, and maxTrips are persisted", "Driver sets schedule but it's lost on page reload; scheduling is cosmetic only"),
    ("MEDIUM", "driver/route.tsx", "'Mark as Done' is client-only — no API call made; progress lost on reload, backend never updated", "Driver marks stops complete but system doesn't know; order status never advances via route page"),
    ("MEDIUM", "staff/orders.tsx, staff/active.tsx", "'View'/'Details' buttons navigate to customer route /orders/:id instead of a staff-specific route", "Staff members land on customer-facing order detail page or 404"),
    ("MEDIUM", "staff/quality.tsx", "Quality check submit fires no API call — only sets local state and shows toast; data never persisted", "Quality control data is purely cosmetic; stats never update from submissions"),
    ("MEDIUM", "manager/payouts.tsx", "'Process Payout' buttons fire only toasts, no API calls — payouts never actually submitted to backend", "Financial workflow is completely non-functional; payouts cannot be processed"),
    ("MEDIUM", "routes.ts POST /api/auth/demo-login", "Demo login (no password required) active unconditionally — no environment guard", "Demo login works in production; anyone can log in as any demo user"),
    ("MEDIUM", "routes.ts calculatePayouts() (line 204)", "Driver payout hardcoded $8.50 × 2 = $17 — ignores driver.payoutPerTrip field", "Drivers with different negotiated rates all receive same flat payout"),
    ("MEDIUM", "routes.ts consent charge recalc (line 2716)", "New total omits discount and tip — formula is subtotal + tax + deliveryFee without subtracting discount", "Consented additional charges inflate total by the discount amount"),
    ("MEDIUM", "routes.ts promo usedCount (line 2031)", "Promo usage counter incremented before order creation — if createOrder() fails, promo use is permanently burned", "Limited-use promo codes lose a use even when order creation fails"),
    ("MEDIUM", "routes.ts loyalty points (line 2041-2050)", "Points deducted before order confirmed — if order creation fails afterward, points are permanently lost", "Customer loses loyalty points without getting an order"),
    ("MEDIUM", "routes.ts PATCH /api/orders/:id/status cancel path", "Cancel via status endpoint doesn't restore loyalty points (unlike POST /api/orders/:id/cancel which does)", "Two cancel paths with different behavior; one silently eats redeemed points"),
    ("MEDIUM", "routes.ts quality_check status (line 726)", "quality_check is in schema comments but absent from validTransitions — orders cannot transition to this status", "Quality check step is unreachable; qualityCheckedAt timestamp column never set"),
    ("MEDIUM", "routes.ts POST /api/drivers (line 1897)", "Mass assignment — spreads unvalidated req.body into createDriver(); attacker can set earnings, payout rates", "Malicious caller sets arbitrary driver fields including financial data"),
    ("MEDIUM", "routes.ts GET /api/admin/analytics (line 3863)", "revenueByDay uses Math.random() — returns different data on every call", "Dashboard charts show random numbers; analytics are unreliable"),
    ("MEDIUM", "routes.ts GET /api/admin/financial (line 3955)", "monthlyTrend uses Math.random() — same issue as analytics", "Financial trend data is fabricated; different on each page load"),
    ("MEDIUM", "routes.ts POST /api/pricing/calculate (line 2927)", "No error handling — malformed bags JSON crashes with unhandled SyntaxError", "Pricing endpoint returns 500 with stack trace on bad input"),
    ("MEDIUM", "routes.ts driver creation (line 1887)", "Synthetic email name@offload.com has no uniqueness check — duplicate names cause unhandled DB constraint error", "Adding two drivers with same name returns 500 error"),
    ("MEDIUM", "routes.ts no DB transactions", "Multi-step operations (order creation, payouts, loyalty) use separate storage calls with no transaction wrapping", "Crash mid-operation leaves DB in partial state (e.g., promo incremented but order not created)"),
    ("MEDIUM", "routes.ts fraud-alerts O(n²) (line 3599)", "calculateFraudRisk called for every order; each call makes 3+ DB queries — no pagination", "Fraud alerts endpoint becomes extremely slow as order count grows"),
    ("MEDIUM", "routes.ts vendor-scores GET writes DB (line 3387)", "Updates every vendor's aiHealthScore on each GET request — side effect on a read endpoint", "Read-only dashboard call modifies database on every load"),
    ("MEDIUM", "admin/analytics.tsx (lines 158-179)", "Trend indicators hardcoded (+12%, +8%, etc.) — never calculated from actual data", "Admins see fabricated growth numbers that don't reflect reality"),
    ("MEDIUM", "admin/fraud.tsx (line 253)", "isPending flag shared across all alert rows — processing one alert disables all buttons", "Admin cannot act on independent fraud alerts in parallel"),
    ("MEDIUM", "admin layout (no mobile)", "Admin sidebar has no responsive/mobile handling — no hamburger menu or off-canvas drawer", "Admin dashboard is unusable on mobile viewports"),
    ("MEDIUM", "Multiple admin pages", "Missing error states — failed API calls silently show 'no data' or fall back to simulated data with no error indicator", "Admins see misleading empty states when API is down instead of error messages"),
    ("MEDIUM", "routes.ts referral reward (line 2261)", "Referral reward inconsistency — schema stores dollar amounts but system always awards hardcoded 1,000 points", "referrerReward/refereeReward fields in DB are meaningless; actual reward is always 1,000 pts"),
    ("MEDIUM", "routes.ts referral duplicates (line 2241)", "Duplicate referral records possible — same customer can be entered via register and referrals/apply", "Double-rewarding on same order delivery"),
    ("MEDIUM", "profile.tsx (lines 336-341)", "'Admin Dashboard' link exposed to all customer users — no role check to hide it", "Any customer can see and navigate to admin dashboard link"),
]
story.append(make_bug_table(medium_bugs))
story.append(Spacer(1, 4))
story.append(Paragraph(f"<b>{len(medium_bugs)} medium-priority issues identified</b>", s_body))

story.append(PageBreak())

# ── LOW ─────────────────────────────────────────────────────────────
story.append(Paragraph("1.4  LOW — Cosmetic Issues, Unused Code, Minor UX", s_h1))
story.append(Paragraph(
    "Minor issues including dead imports, cosmetic display bugs, and unused code. These don't affect core functionality.", s_body))
story.append(Spacer(1, 6))

low_bugs = [
    ("LOW", "home.tsx, orders.tsx, admin/orders.tsx, disputes.tsx, vendor-scoring.tsx", "Bare '$' displayed when order.total is null — optional chaining produces undefined, showing '$' with no number", "Cosmetic display issue showing '$' or '$undefined' in price fields"),
    ("LOW", "home.tsx (line 6)", "Unused imports: Bell and Zap from lucide-react", "Dead code; no functional impact"),
    ("LOW", "orders.tsx (line 6)", "Unused imports: Filter and ArrowDownCircle", "Dead code; no functional impact"),
    ("LOW", "login.tsx (line 4), register.tsx (line 4)", "apiRequest imported but never used in either file", "Dead imports; no functional impact"),
    ("LOW", "register.tsx (line 10)", "setUser destructured from useAuth but never referenced", "Dead variable; no functional impact"),
    ("LOW", "login.tsx (lines 124-130)", "'Forgot Password' button has no onClick handler — does nothing when clicked", "Feature appears available but is non-functional"),
    ("LOW", "login.tsx (lines 159-183)", "'Continue with Google' button has no onClick handler", "OAuth button is decorative only"),
    ("LOW", "register.tsx (lines 162-180)", "Phone number UI shows +1 prefix visually but doesn't prepend it to the stored value", "Phone numbers stored without country code"),
    ("LOW", "addresses.tsx (line 184)", "Invalid Tailwind class ml-13 — not in default spacing scale (jumps ml-12 to ml-14)", "Action buttons row not indented as intended"),
    ("LOW", "payments.tsx (lines 248-254)", "Edit button on payment methods is a toast-only stub — no edit functionality", "Pencil icon suggests editing but just shows a toast"),
    ("LOW", "payments.tsx (lines 370-376)", "Expiry date input validates only length >= 4, not actual date format", "Users can save cards with invalid expiry like '1111'"),
    ("LOW", "order-detail.tsx (line 629)", "event.details rendered via String(val) — shows '[object Object]' for nested objects", "Event details panel shows unhelpful text for complex values"),
    ("LOW", "driver/order-detail.tsx", "bagCountConfirmed state set but never read — dead state variable", "Unused code; no functional impact"),
    ("LOW", "driver/layout.tsx", "Nav link to /driver/orders has no dedicated page — routes to DriverDashboard (same as /driver)", "Redundant route; not broken but confusing"),
    ("LOW", "manager/layout.tsx", "Nav label 'Analytics' links to /manager/payouts — misleading label", "Users expect analytics page but land on payouts"),
    ("LOW", "manager/orders.tsx (lines 301-306)", "'View Details' button has no onClick handler and no href — completely dead button", "Button renders but does nothing when clicked"),
    ("LOW", "App.tsx (line 58)", "navigate declared but never used in RequireAuth — redirects use Redirect component instead", "Dead variable; no functional impact"),
    ("LOW", "App.tsx SeedInitializer", "Runs /api/seed on every app mount and resets all React Query cache — causes unnecessary re-fetching", "Brief loading flash on every page load; disrupts in-flight mutations"),
    ("LOW", "routes.ts platformFee field", "orders.platformFee column exists in schema but is never written by processPaymentCapture()", "Per-order platform fee data is always 0; derived by subtraction instead"),
    ("LOW", "routes.ts holiday list (line 332)", "US_HOLIDAYS_2026 hardcoded — stops applying holiday surges after Dec 2026", "Surge pricing won't trigger on holidays in 2027+"),
    ("LOW", "routes.ts subscription cancel (line 3745)", "Cancel sets subscriptionTier to null but doesn't clear subscriptionStartDate", "Stale start date remains after cancellation"),
    ("LOW", "routes.ts updatedAt not maintained", "orders.updatedAt set at creation but never updated on subsequent status changes", "Audit field unreliable for tracking last modification time"),
    ("LOW", "routes.ts return driver never freed (line 2353)", "On delivery, only pickup driver is freed — return driver stays in 'busy' status permanently", "Return drivers accumulate in busy state; become unavailable"),
    ("LOW", "admin/overview.tsx, admin/orders.tsx", "createdAt fallback to empty string produces 'Invalid Date' if field is unexpectedly absent", "Dates show 'Invalid Date' text in edge cases"),
    ("LOW", "admin/vendors.tsx (lines 361-362), admin/drivers.tsx (lines 281-282)", "Stale toast — form.name read after setForm reset; relies on batched state timing", "Toast may show blank name in strict/concurrent mode"),
    ("LOW", "admin/financial.tsx (lines 332-334)", "Division by zero possible in vendor breakdown totals when grossRevenue sums to 0", "Percentage shows NaN% or blank in footer row"),
]
story.append(make_bug_table(low_bugs))
story.append(Spacer(1, 4))
story.append(Paragraph(f"<b>{len(low_bugs)} low-priority issues identified</b>", s_body))

# Bug summary
story.append(Spacer(1, 10))
story.append(Paragraph("Bug Summary", s_h2))
total = len(critical_bugs) + len(high_bugs) + len(medium_bugs) + len(low_bugs)
summary_rows = [
    [Paragraph("Priority", s_table_header), Paragraph("Count", s_table_header), Paragraph("Description", s_table_header)],
    [Paragraph("CRITICAL", s_badge_critical), Paragraph(str(len(critical_bugs)), s_table_cell), Paragraph("Security holes, data corruption, auth bypass", s_table_cell)],
    [Paragraph("HIGH", s_badge_high), Paragraph(str(len(high_bugs)), s_table_cell), Paragraph("Runtime crashes, broken features, wrong data", s_table_cell)],
    [Paragraph("MEDIUM", s_badge_medium), Paragraph(str(len(medium_bugs)), s_table_cell), Paragraph("Stubs, missing backend, inconsistent behavior", s_table_cell)],
    [Paragraph("LOW", s_badge_low), Paragraph(str(len(low_bugs)), s_table_cell), Paragraph("Dead code, cosmetic issues, minor UX problems", s_table_cell)],
    [Paragraph("<b>TOTAL</b>", s_table_cell), Paragraph(f"<b>{total}</b>", s_table_cell), Paragraph("", s_table_cell)],
]
st = Table(summary_rows, colWidths=[80, 50, CONTENT_W - 130])
st.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), DARK_BG),
    ("GRID", (0, 0), (-1, -1), 0.4, BORDER_LIGHT),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("BACKGROUND", (0, -1), (-1, -1), VIOLET_LIGHT),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
]))
story.append(st)

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════
# PART 2: COMPLETE FEATURE INVENTORY
# ═══════════════════════════════════════════════════════════════════
story.append(Paragraph("PART 2: COMPLETE FEATURE INVENTORY", s_part_title))
story.append(Paragraph(
    "Every single feature that exists in the Offload platform, organized by role. Each feature is marked as "
    "<b>WORKS</b> (fully functional end-to-end), <b>PARTIAL</b> (frontend works but backend is incomplete or vice versa), "
    "or <b>STUB</b> (UI exists but clicking does nothing meaningful).",
    s_body))
story.append(divider())

# ── A. LOGIN & AUTH ─────────────────────────────────────────────────
story.append(Paragraph("A. Login &amp; Authentication", s_h1))
story.append(make_feature_table([
    ("Demo login system (5 roles)", "WORKS", "Customer, Driver, Staff, Manager, Admin — each with pre-seeded demo accounts. Login by username only (no password required for demo)."),
    ("Email/password login", "WORKS", "Standard login form with email and password fields, password visibility toggle. Authenticates against server."),
    ("Registration page", "WORKS", "Name, email, phone, password, confirm-password fields with client-side validation. Role read from URL query param. Submits to /api/auth/register."),
    ("Role-based routing", "WORKS", "Each role redirected to their own dashboard after login — /home (customer), /driver (driver), /staff/orders (staff), /manager/orders (manager), /admin (admin)."),
    ("'Forgot Password' button", "STUB", "Button renders on login page but has no onClick handler. Does nothing."),
    ("'Continue with Google' OAuth", "STUB", "Google sign-in button renders but has no onClick handler. No OAuth integration."),
    ("Session management", "PARTIAL", "Auth context stores user in React state. Sign-out navigates to / but does NOT clear the auth session (bug)."),
]))

story.append(PageBreak())

# ── B. CUSTOMER SIDE ────────────────────────────────────────────────
story.append(Paragraph("B. Customer Side (Marta Demo)", s_h1))

story.append(Paragraph("Home Page", s_h2))
story.append(make_feature_table([
    ("Personalized greeting", "WORKS", "Shows 'Good morning/afternoon/evening, [Name]' based on time of day and logged-in user."),
    ("Location display", "WORKS", "Shows customer's primary address. Displays city/neighborhood from default address."),
    ("Active order tracker", "WORKS", "Banner showing most recent active order with status badge, progress bar, and tap to view detail."),
    ("Vendor recommendation card", "WORKS", "Top-rated vendor card with name, rating, capabilities, distance. Links to schedule page."),
    ("Wash style cards", "WORKS", "Cards showing Regular, Delicate, Eco-Friendly wash types with descriptions and pricing info."),
    ("Schedule Pickup CTA", "WORKS", "Primary action button 'Schedule a Pickup' navigates to /schedule order flow."),
    ("Quick action shortcuts", "WORKS", "Grid of shortcut cards: Schedule, Orders, Rewards, Chat, Referrals, Profile."),
    ("Recent orders list", "WORKS", "Shows last 3 orders with status badges, vendor name, and total price."),
]))

story.append(Paragraph("Order Scheduling Flow", s_h2))
story.append(make_feature_table([
    ("Address selection", "PARTIAL", "Address picker with saved addresses and inline add-new form. Works but hardcoded to userId=1 (all customers share addresses). No validation that address is selected before submit."),
    ("Bag type/quantity selector", "WORKS", "4 bag sizes (Small $12, Medium $18, Large $28, XL $38) with +/- quantity controls."),
    ("Delivery speed selection", "WORKS", "Standard (48h), Express (24h), Same Day, Rush (3h) with price multipliers displayed."),
    ("Pricing calculator", "WORKS", "Real-time pricing calculation with subtotal, surge multiplier, tax (8.875%), delivery fee. Updates as selections change."),
    ("Surge pricing display", "WORKS", "Shows surge multiplier when active (time-of-day, day-of-week, holiday, demand factors)."),
    ("Promo code input", "WORKS", "Enter promo code field with validate button. Shows discount amount when valid code applied."),
    ("Payment method selection", "PARTIAL", "Shows saved payment methods with default selection. Hardcoded to userId=1."),
    ("Wash notes/preferences", "WORKS", "Text area for special instructions included in order creation."),
    ("Schedule for later", "WORKS", "Toggle between 'Now' and scheduled date/time picker for future pickup."),
    ("Order submission", "WORKS", "Creates order via POST /api/orders. Returns order ID, triggers vendor/driver assignment, navigates to confirmation."),
]))

story.append(Paragraph("Orders List", s_h2))
story.append(make_feature_table([
    ("Tab filters (All/Active/Done/Cancelled)", "WORKS", "Filters order list by status group. Active = non-terminal statuses. Done = delivered. Cancelled = cancelled."),
    ("Order cards", "WORKS", "Each card shows order number, status badge with color, vendor name, item count, total price, progress bar."),
    ("Cancel order from list", "PARTIAL", "Cancel button appears for pending/confirmed/driver_assigned but NOT pickup_in_progress (inconsistent with detail page)."),
    ("In-list messaging", "WORKS", "Bottom sheet for sending/viewing messages about an order without leaving the list."),
]))

story.append(Paragraph("Order Detail", s_h2))
story.append(make_feature_table([
    ("Full event timeline", "WORKS", "Scrollable timeline of all status change events with timestamps. Expandable details for each event."),
    ("Status tracking header", "WORKS", "Current status badge, order number, vendor name, driver info when assigned."),
    ("Order summary with pricing", "WORKS", "Bag breakdown, subtotal, tax, delivery fee, discounts, tip, total — all displayed."),
    ("Cancel order", "PARTIAL", "Cancel button appears for more statuses than list view (includes pickup_in_progress). Calls POST /api/orders/:id/cancel. Restores loyalty points."),
    ("Reorder", "WORKS", "Button to create a new order with same bags and preferences as the current order."),
    ("Contact Support dialog", "STUB", "Dialog collects message but submits NO API request. Message is silently discarded. Shows success toast falsely."),
    ("Dispute filing", "WORKS", "Form to file a dispute with reason selection and description. Submits to /api/disputes."),
    ("Consent requests display", "WORKS", "Shows pending consent requests (e.g., overweight charges) with approve/deny actions."),
    ("Review prompt", "WORKS", "Star rating and comment form appears for delivered orders."),
]))

story.append(Paragraph("Loyalty Rewards", s_h2))
story.append(make_feature_table([
    ("Tier display", "WORKS", "Shows current tier (Bronze/Silver/Gold/Platinum) with icon, color coding, and tier name."),
    ("Points balance", "WORKS", "Current points balance displayed prominently. Updates after earning/redeeming."),
    ("Progress bar to next tier", "WORKS", "Visual progress bar showing points needed for next tier upgrade."),
    ("Perks list", "WORKS", "Tier-specific perks displayed: priority support, free delivery, exclusive promos, etc."),
    ("Point redemption slider", "WORKS", "Slider to select points to redeem. Shows dollar equivalent (100 pts = $1). Submits to /api/loyalty/redeem."),
    ("Transaction history", "WORKS", "List of point earning and redemption events with timestamps and descriptions."),
]))

story.append(Paragraph("Referral Program", s_h2))
story.append(make_feature_table([
    ("Referral code display", "WORKS", "Unique referral code shown with copy-to-clipboard button."),
    ("Share referral link", "WORKS", "Copy link button and native share API integration for sharing referral URL."),
    ("Impact stats", "WORKS", "Shows total referrals, successful conversions, total rewards earned."),
    ("Referral status tracking", "WORKS", "List of referred users with status (pending/completed/rewarded) and reward amounts."),
]))

story.append(Paragraph("AI Chat Assistant", s_h2))
story.append(make_feature_table([
    ("Chat message interface", "WORKS", "Message bubbles with user/AI styling, auto-scroll, typing indicator animation."),
    ("Intent detection (8 categories)", "WORKS", "Backend classifies: order_status, pricing, schedule, cancel, loyalty, support, complaint, general."),
    ("Contextual responses", "WORKS", "AI provides context-aware responses based on user's orders, loyalty status, and account data."),
    ("Quick action buttons", "WORKS", "Pre-defined quick actions: 'Track my order', 'Schedule pickup', 'Check rewards', etc."),
    ("Chat session management", "WORKS", "Sessions persisted to DB. Message history maintained across page reloads."),
]))

story.append(Paragraph("Profile &amp; Settings", s_h2))
story.append(make_feature_table([
    ("Account stats display", "PARTIAL", "Shows orders count, total spend, average rating — but hardcoded to userId=1 data."),
    ("Personal info editing", "PARTIAL", "Edit name, email, phone fields. Saves via PATCH but hardcoded to userId=1."),
    ("Saved addresses", "PARTIAL", "Full CRUD: add, edit, delete, set default. All operations hardcoded to userId=1."),
    ("Payment methods", "PARTIAL", "Add new cards/Apple Pay/Google Pay, delete, set default. Hardcoded to userId=1. Edit button is stub (toast only)."),
    ("Notification preferences", "WORKS", "Toggle switches for push, email, SMS notification categories."),
    ("Wash preferences", "WORKS", "Set preferred wash type, detergent, fabric softener, special handling preferences."),
    ("Offload Certified toggle", "WORKS", "Toggle to prefer certified vendors. Affects vendor matching in order flow."),
    ("Theme toggle (light/dark)", "WORKS", "Switches between light and dark mode. Persists via CSS class on root element."),
    ("Sign out", "PARTIAL", "Navigates to home and shows toast but does NOT clear auth session (bug)."),
]))

story.append(Paragraph("Addresses Management Page", s_h2))
story.append(make_feature_table([
    ("Address list display", "PARTIAL", "Shows all saved addresses with label, full address, default badge. Hardcoded to userId=1."),
    ("Add new address", "PARTIAL", "Bottom sheet form with label, street, city, state, zip. Creates via API. Hardcoded userId=1."),
    ("Edit existing address", "PARTIAL", "Pre-fills form with address data, updates via PATCH. Hardcoded userId=1."),
    ("Delete address", "PARTIAL", "Confirmation dialog before deletion via DELETE endpoint. Hardcoded userId=1."),
    ("Set default address", "PARTIAL", "Toggle to mark an address as default; unsets other defaults. Hardcoded userId=1."),
]))

story.append(Paragraph("Payment Methods Page", s_h2))
story.append(make_feature_table([
    ("Payment method list", "PARTIAL", "Shows cards with last4, expiry, brand icon, Apple Pay. Hardcoded to userId=1."),
    ("Add new payment method", "PARTIAL", "Form for card number, expiry (weak validation), cardholder name. Hardcoded userId=1."),
    ("Delete payment method", "PARTIAL", "Delete with confirmation. Hardcoded userId=1."),
    ("Set default payment", "PARTIAL", "Toggle default. Hardcoded userId=1."),
    ("Edit payment method", "STUB", "Pencil icon button exists but only shows a toast. No edit functionality."),
]))

story.append(Paragraph("Notifications", s_h2))
story.append(make_feature_table([
    ("Unread count badge", "WORKS", "Bell icon in header shows count of unread notifications."),
    ("Notification list", "WORKS", "Scrollable list of notifications with title, message, timestamp, read/unread state."),
    ("Mark as read", "WORKS", "Tapping notification marks it as read and decrements badge count."),
]))

story.append(PageBreak())

# ── C. DRIVER SIDE ──────────────────────────────────────────────────
story.append(Paragraph("C. Driver Side (Peter Demo)", s_h1))

story.append(Paragraph("Driver Dashboard", s_h2))
story.append(make_feature_table([
    ("Personalized greeting", "PARTIAL", "Greeting with driver name — works when auth is stable but page crashes on auth state change (Rules of Hooks)."),
    ("Today's performance card", "PARTIAL", "Shows trips completed, earnings today, current rating. Crashes on auth change."),
    ("Route list (pickup/delivery cards)", "PARTIAL", "Cards showing assigned pickups and deliveries with customer info, address, status. Crashes on auth change."),
    ("Filter tabs (Active/Pickup/Delivery)", "PARTIAL", "Tab filters for route cards. Works but subject to same crash."),
    ("Navigate button", "PARTIAL", "Links to /driver/navigation/:orderId. Works but navigation shows wrong address for deliveries (bug)."),
    ("Quick action shortcuts", "PARTIAL", "Navigation and Messages shortcuts. Subject to Hooks crash."),
]))

story.append(Paragraph("Driver Earnings", s_h2))
story.append(make_feature_table([
    ("Today summary (trips/earned/tips)", "PARTIAL", "Displays today's trip count, earnings, and tip total. Crashes on auth state change (Hooks violation)."),
    ("Pending payout display", "PARTIAL", "Shows amount pending next payout. Subject to crash."),
    ("7-day bar chart", "PARTIAL", "Recharts bar chart of last 7 days' earnings. Subject to crash."),
    ("Lifetime stats", "PARTIAL", "Total trips, total earnings, average rating, member-since. Subject to crash."),
    ("Trip history list", "PARTIAL", "Recent completed trips with order details and amounts. Subject to crash."),
]))

story.append(Paragraph("Driver Availability", s_h2))
story.append(make_feature_table([
    ("Status toggle (Available/Busy/Offline)", "PARTIAL", "Toggle updates driver status via API. Crashes on auth state change (Hooks violation)."),
    ("Vehicle info display", "PARTIAL", "Shows vehicle type and license plate. Subject to crash."),
    ("Preferred zones (zip input)", "PARTIAL", "Add/remove zip codes for preferred delivery zones. Saved to API. Subject to crash."),
    ("Max trips slider", "PARTIAL", "Slider to set max trips per day. Saved to API. Subject to crash."),
    ("Schedule preferences (days/times)", "STUB", "Day-of-week checkboxes and time range inputs render but are NEVER saved to any API endpoint."),
]))

story.append(Paragraph("Optimized Route", s_h2))
story.append(make_feature_table([
    ("AI-ordered stop list", "PARTIAL", "Shows stops in optimized order with addresses and time estimates. Crashes on auth change (Hooks)."),
    ("Time/distance estimates", "PARTIAL", "Total route time and distance displayed in summary card. Subject to crash."),
    ("Progress bar", "PARTIAL", "Visual progress of completed vs remaining stops. Client-side only."),
    ("Start Navigation button", "PARTIAL", "Opens navigation view for first/next stop. Subject to crash."),
    ("Mark stop as done", "STUB", "Button updates local state only — no API call. Progress lost on reload. Backend never updated."),
]))

story.append(Paragraph("Driver Order Detail", s_h2))
story.append(make_feature_table([
    ("Order info display", "WORKS", "Full order details: number, status, bags, pricing, notes."),
    ("Customer info", "WORKS", "Customer name, phone, address displayed for assigned orders."),
    ("Bag details confirmation", "WORKS", "Dialog to confirm bag count at pickup. Confirmation triggers status advance."),
    ("Status advance button", "WORKS", "Primary action button advances order through lifecycle: Accept → Picked Up → At Vendor → etc."),
    ("Order progress timeline", "WORKS", "Visual timeline of order status changes with timestamps."),
]))

story.append(Paragraph("Driver Navigation", s_h2))
story.append(make_feature_table([
    ("Simulated map view", "WORKS", "Full-screen map simulation with route visualization."),
    ("Bottom sheet destination info", "PARTIAL", "Shows destination address and scheduled time. BUG: always shows pickup address even for delivery stops."),
    ("Google Maps deep link", "PARTIAL", "Opens Google Maps for turn-by-turn navigation. Links to wrong address for deliveries."),
    ("Status advance from nav", "WORKS", "Action button to advance order status without leaving navigation view."),
]))

story.append(PageBreak())

# ── D. STAFF SIDE ───────────────────────────────────────────────────
story.append(Paragraph("D. Staff / Laundromat Side (Maria Demo)", s_h1))

story.append(Paragraph("Staff Orders Dashboard", s_h2))
story.append(make_feature_table([
    ("Active/Washing/Ready counts", "WORKS", "Quick stat cards showing count of orders in each stage."),
    ("Order cards with status", "WORKS", "List of all non-cancelled orders with status badges, customer name, bag info."),
    ("Weigh &amp; Photo button", "WORKS", "Navigates to /staff/weigh/:id for order intake workflow."),
    ("Start Washing button", "WORKS", "Navigates to /staff/wash/:id for washing workflow."),
    ("View button", "PARTIAL", "Navigates to /orders/:id (customer route) instead of a staff-specific route. May show wrong page or 404."),
]))

story.append(Paragraph("AI Queue", s_h2))
story.append(make_feature_table([
    ("Smart order prioritization", "WORKS", "AI-prioritized queue based on SLA urgency, order age, delivery speed tier."),
    ("Capacity bar", "WORKS", "Visual bar showing current capacity utilization vs maximum."),
    ("Tab filters (All/Urgent/In Progress/Ready)", "WORKS", "Filter queue by urgency and processing state."),
    ("SLA countdown on cards", "WORKS", "Each card shows time remaining until SLA breach with color-coded urgency."),
    ("Action buttons to advance orders", "WORKS", "Buttons to move orders through pipeline stages from the queue view."),
]))

story.append(Paragraph("Quality Control", s_h2))
story.append(make_feature_table([
    ("Personal quality scores", "WORKS", "Displays staff member's quality rating vs vendor average."),
    ("7-day quality chart", "WORKS", "Bar chart showing quality scores over last 7 days."),
    ("Quality checklist", "STUB", "Checklist items render and can be toggled but submit fires NO API call. Data never persisted."),
    ("Star self-assessment", "STUB", "Star rating component works client-side but value is never sent to backend."),
    ("Photo upload simulation", "STUB", "File input renders but upload is simulated only."),
]))

story.append(Paragraph("Weigh &amp; Photo (Intake)", s_h2))
story.append(make_feature_table([
    ("Weight recording per bag", "WORKS", "Input fields for recording intake weight of each bag. Submits to /api/orders/:id/intake."),
    ("Photo capture", "WORKS", "Simulated photo capture interface for documenting bag condition."),
    ("Status advance to washing", "WORKS", "After recording weight, advances order status to 'washing' automatically."),
]))

story.append(Paragraph("Start Washing", s_h2))
story.append(make_feature_table([
    ("Start wash (duration/options)", "WORKS", "Set wash duration, separate-by-type options. Initiates washing phase."),
    ("Output weight recording", "WORKS", "Record output weight after washing. Triggers consent if weight discrepancy detected."),
    ("Pack order", "WORKS", "Advance to packing state after wash complete."),
    ("Mark ready for delivery", "WORKS", "Final step: marks order ready_for_delivery, notifies system for driver dispatch."),
]))

story.append(Paragraph("Active Orders Monitoring", s_h2))
story.append(make_feature_table([
    ("Grouped by state (washing/complete/packing)", "WORKS", "Sections for each processing stage with order counts."),
    ("Advance status buttons", "WORKS", "Quick buttons to advance orders between stages."),
    ("Details button", "PARTIAL", "Navigates to customer-facing /orders/:id instead of staff route."),
]))

story.append(Paragraph("Staff Profile", s_h2))
story.append(make_feature_table([
    ("User info display", "WORKS", "Name, email, role badge displayed."),
    ("Theme toggle", "WORKS", "Light/dark mode switch."),
    ("Logout", "WORKS", "Logs out and redirects to login page."),
]))

story.append(PageBreak())

# ── E. MANAGER SIDE ─────────────────────────────────────────────────
story.append(Paragraph("E. Manager Side", s_h1))

story.append(make_feature_table([
    ("Orders overview with search", "WORKS", "Full order list with search bar and filter tabs (All/Active/Delivered/Cancelled)."),
    ("Key metrics (total/active/completed)", "WORKS", "Summary stats cards at top of orders page."),
    ("Order cards with details", "WORKS", "Cards showing customer, status, bags, notes, payment status for each order."),
    ("View Details button", "STUB", "Button renders with no onClick handler and no href. Completely dead — does nothing."),
    ("Payouts — Revenue overview", "WORKS", "Cards showing total revenue, platform revenue, vendor payouts, driver payouts."),
    ("Payouts — Vendor breakdown table", "WORKS", "Per-vendor revenue/payout figures with calculated margins."),
    ("Process Payout button", "STUB", "Button fires toast only — no API call. Payouts are never actually processed."),
    ("Process All Payouts button", "STUB", "Same as above — toast only, no backend call."),
    ("Nav label 'Analytics'", "PARTIAL", "Links to /manager/payouts (works) but label says 'Analytics' which is misleading."),
]))

story.append(PageBreak())

# ── F. ADMIN SIDE ───────────────────────────────────────────────────
story.append(Paragraph("F. Admin Side", s_h1))

story.append(Paragraph("Admin Dashboard Overview", s_h2))
story.append(make_feature_table([
    ("KPI metric cards", "WORKS", "Revenue, platform revenue, order count, vendor count, driver count, avg order value."),
    ("Order pipeline breakdown", "WORKS", "Counts of orders in each status stage."),
    ("Revenue by vendor bar chart", "WORKS", "Horizontal bar chart showing revenue per vendor via Recharts."),
    ("Recent activity feed", "WORKS", "Live feed of recent order events across the platform."),
    ("Error handling", "PARTIAL", "No error state shown when API fails — just renders nothing."),
]))

story.append(Paragraph("Admin Orders Management", s_h2))
story.append(make_feature_table([
    ("Full order list with expand-in-place", "WORKS", "Expandable order rows showing full detail panel with timeline, pricing, bags."),
    ("Status filters", "WORKS", "Dropdown and tab filters by order status."),
    ("Date filtering", "WORKS", "Date range filter for order list."),
    ("Status transition controls", "WORKS", "Dropdown to advance order status with valid transitions enforced."),
    ("Timeline view per order", "WORKS", "Chronological event list for expanded order."),
    ("Multi-select", "WORKS", "Checkbox selection of multiple orders for batch operations."),
    ("CSV export", "PARTIAL", "Exports selected/all orders to CSV. BUG: writes literal 'undefined' for null totals."),
]))

story.append(Paragraph("Admin Vendors Management", s_h2))
story.append(make_feature_table([
    ("Vendor card list", "WORKS", "Cards showing vendor name, status, rating, capacity, capabilities, revenue."),
    ("Add Vendor dialog", "WORKS", "Creation form with name, address, capacity, capabilities, contact info."),
    ("Toggle vendor status", "WORKS", "Suspend/activate vendors via status toggle button."),
    ("Adjust capacity", "WORKS", "Update vendor capacity limits."),
    ("Performance stats per vendor", "WORKS", "Orders completed, revenue, average rating displayed per vendor."),
    ("Error handling", "PARTIAL", "Failed API shows 'No vendors found' instead of error message."),
]))

story.append(Paragraph("Admin Drivers Management", s_h2))
story.append(make_feature_table([
    ("Driver card list", "WORKS", "Cards showing driver name, status, vehicle, active assignments, stats."),
    ("Add Driver dialog", "WORKS", "Creation form with name, phone, vehicle type, license plate."),
    ("Status change controls", "WORKS", "Set driver to Available/Busy/Offline."),
    ("Performance stats per driver", "WORKS", "Rating, completed trips, total earnings displayed per driver."),
    ("Error handling", "PARTIAL", "Failed API shows 'No drivers found' instead of error message."),
]))

story.append(Paragraph("Admin Disputes Management", s_h2))
story.append(make_feature_table([
    ("Dispute list with filters", "WORKS", "All disputes with status filters (open/investigating/resolved/closed)."),
    ("Dispute cards with order info", "WORKS", "Each dispute shows related order details, customer info, reason, timeline."),
    ("Resolution notes form", "WORKS", "Text area to enter resolution notes for a dispute."),
    ("Begin Investigation action", "WORKS", "Button advances dispute to investigating status."),
    ("Resolve/Close actions", "WORKS", "Buttons to resolve with credit or close dispute."),
    ("AI resolution suggestions", "WORKS", "Contextual AI suggestions for dispute resolution displayed."),
]))

story.append(Paragraph("Admin Analytics", s_h2))
story.append(make_feature_table([
    ("KPI cards (revenue, orders, customers, AOV)", "PARTIAL", "Cards display values but trend percentages (+12%, +8%, etc.) are hardcoded, not calculated."),
    ("7-day revenue bar chart", "PARTIAL", "Recharts bar chart renders but data uses Math.random() — different on every load."),
    ("Order status pie chart", "WORKS", "Pie chart showing distribution of orders across statuses."),
    ("Customer acquisition funnel", "WORKS", "Funnel visualization of customer journey stages."),
    ("Top vendor table", "WORKS", "Ranked table of top-performing vendors by revenue."),
    ("Simulated fallback", "PARTIAL", "Falls back to simulated data silently when API fails — no error indicator."),
]))

story.append(Paragraph("Admin Vendor Health Scoring", s_h2))
story.append(make_feature_table([
    ("Sortable scoreboard table", "WORKS", "All vendors with health scores, sortable by score, name, orders."),
    ("AI health score (0-100)", "WORKS", "5-factor composite score: rating, on-time rate, disputes, processing time, capacity utilization."),
    ("Elite/At-Risk vendor badges", "WORKS", "Color-coded badges identifying top performers and struggling vendors."),
    ("On-time rate display", "WORKS", "Percentage of orders completed within SLA for each vendor."),
    ("Individual vendor deep-dive", "PARTIAL", "Score breakdown bars and AI recommendations. BUG: blank panel for vendors without simulated health data."),
    ("AI recommendations per vendor", "WORKS", "Actionable improvement suggestions based on health score factors."),
]))

story.append(Paragraph("Admin Promo Codes", s_h2))
story.append(make_feature_table([
    ("Promo stats row", "WORKS", "Total promos, active count, total redemptions, unlimited codes count."),
    ("Promo table with all codes", "WORKS", "Full table with code, type, discount, usage, status, expiry."),
    ("Create promo dialog", "WORKS", "Form with code, type (percentage/fixed/free_delivery), discount value, max uses, expiry. Zod validation."),
    ("Edit promo dialog", "PARTIAL", "Form pre-fills but type Select uses defaultValue (uncontrolled) — may show wrong type when switching promos."),
    ("Toggle active/inactive", "WORKS", "Switch to activate or deactivate individual promo codes."),
    ("Usage stats per promo", "WORKS", "Shows used count vs max uses for each promo code."),
]))

story.append(Paragraph("Admin Financial Reports", s_h2))
story.append(make_feature_table([
    ("Revenue/payout summary cards", "WORKS", "Total revenue, vendor payouts, driver payouts, platform commission with calculated values."),
    ("Monthly trend area chart", "PARTIAL", "Multi-series Recharts area chart (revenue, vendor payouts, platform revenue). Data uses Math.random()."),
    ("Vendor revenue breakdown table", "WORKS", "Per-vendor gross revenue, vendor payout, platform fee, margin percentage."),
    ("Payout status per vendor", "WORKS", "Shows pending vs completed payout status for each vendor."),
]))

story.append(Paragraph("Admin Fraud Detection", s_h2))
story.append(make_feature_table([
    ("Summary KPIs", "WORKS", "Total flagged, high risk, medium risk, cleared counts."),
    ("Flagged orders table", "WORKS", "Orders with risk score > 70 listed with score bars and risk level."),
    ("Expandable detail panels", "WORKS", "Click to expand showing triggered fraud signals and recommended actions."),
    ("6 fraud signals analyzed", "WORKS", "New account + high value, order frequency, weight discrepancy, multiple addresses, large bag count, promo + high value."),
    ("Clear alert action", "STUB", "Returns success but does NOT persist cleared status to DB. Reappears on reload."),
    ("Escalate alert action", "STUB", "Returns success but does NOT persist escalated status. Reappears on reload."),
]))

story.append(PageBreak())

# ── G. BACKEND ENGINES ──────────────────────────────────────────────
story.append(Paragraph("G. Backend Engines &amp; Systems", s_h1))

story.append(make_feature_table([
    ("Pricing Engine", "WORKS", "Bag-based pricing with 4 sizes (Small $12, Medium $18, Large $28, XL $38). Delivery speed multipliers (1.0x/1.3x/1.6x/2.0x). Tax calculation at 8.875%."),
    ("Auto-Dispatch — Vendor Scoring", "WORKS", "Multi-factor scoring: distance weight 0.3, capacity 0.25, performance tier 0.2, rating 0.15, capability match 0.1, certified bonus. Finds best vendor on order creation."),
    ("Auto-Dispatch — Driver Scoring", "WORKS", "Scoring: distance 0.35, rating 0.25, experience 0.2, workload balance 0.2. Assigns best available driver."),
    ("SLA Engine", "WORKS", "4 tiers: Standard 48h, Express 24h, Same-Day, Rush 3h. Warning thresholds at 75% elapsed. Breach detection. Background monitoring every 2 minutes."),
    ("Surge Pricing Engine", "WORKS", "Time-of-day factors (peak 1.3x), day-of-week (weekend 1.15x), holiday list (1.4x), demand multiplier. Compounds multiplicatively."),
    ("Loyalty Engine", "WORKS", "Tier calculation (Bronze/Silver/Gold/Platinum). Points earning with tier multipliers (1.0x/1.25x/1.5x/2.0x). Subscription bonuses compound on top. Tier upgrade notifications."),
    ("Financial Engine", "PARTIAL", "Vendor payout at 65% of subtotal — but ignores vendor.payoutRate field. Driver payout hardcoded $17 — ignores driver.payoutPerTrip. Payment capture simulation works."),
    ("AI Chatbot Engine", "WORKS", "Intent detection for 8 categories (order_status, pricing, schedule, cancel, loyalty, support, complaint, general). Context-aware responses using user data. Escalation to human for complex issues."),
    ("Vendor Health Scoring Engine", "WORKS", "5-factor scoring: rating weight 0.25, on-time 0.25, disputes 0.2, processing time 0.15, capacity utilization 0.15. AI recommendation generation."),
    ("Fraud Detection Engine", "PARTIAL", "6 signals detected correctly. Auto-flagging at score > 70. BUT clear/escalate actions are stubs (not persisted). O(n²) performance — no pagination."),
    ("Predictive ETA Engine", "PARTIAL", "Phase-based ETA with time-of-day and day-of-week factors. BUG: unsafe non-null assertion on coordinates — NaN results if lat/lng missing."),
    ("Consent System", "WORKS", "Consent requests created for weight discrepancies or additional charges. Auto-approval timeout (60s check interval). Background monitoring."),
    ("Order Event Audit Trail", "WORKS", "Full event logging for every status change with timestamp, actor, details JSON. Queryable per order."),
    ("Notification System", "WORKS", "In-app notifications created for order events, loyalty tier changes, referral completions. Unread count tracking. Mark-as-read API."),
    ("Background Tasks", "WORKS", "Two background intervals: consent timeout checker (60s), SLA status checker (2min). Run continuously in server process."),
]))

story.append(PageBreak())

# ── H. DATA MODEL ───────────────────────────────────────────────────
story.append(Paragraph("H. Data Model &amp; Technical Stack", s_h1))

story.append(Paragraph("Database Schema — 18 Tables", s_h2))
story.append(Paragraph(
    "All tables defined in shared/schema.ts (~486 lines) with Drizzle ORM. Proper types with Zod insert schemas for validation.",
    s_body))

db_tables = [
    ("users", "User accounts with name, email, phone, role, password, loyalty fields, subscription fields, referral code"),
    ("orders", "Core order table: customer, vendor, driver IDs, status, bags JSON, pricing fields, SLA, timestamps, consent/weight tracking"),
    ("vendors", "Laundromat businesses: name, address, coordinates, capacity, capabilities JSON, rating, performance tier, health score, payout rate"),
    ("drivers", "Driver profiles: userId, vehicle, license, status, preferred zones, max trips, coordinates, earnings, payout rate"),
    ("addresses", "Customer saved addresses: street, city, state, zip, label, isDefault, coordinates"),
    ("paymentMethods", "Saved payment methods: type (card/apple_pay/google_pay), last4, expiry, brand, isDefault"),
    ("orderEvents", "Audit trail: orderId, status, timestamp, performedBy, details JSON"),
    ("disputes", "Customer disputes: orderId, customerId, reason, description, status, resolution, credit amount"),
    ("reviews", "Order reviews: orderId, customerId, vendorId, rating, comment, timestamp"),
    ("notifications", "In-app notifications: userId, title, message, type, isRead, metadata JSON"),
    ("chatSessions", "AI chat sessions: userId, messagesJson, createdAt, updatedAt"),
    ("referrals", "Referral tracking: referrerId, refereeId, status, rewards, completedOrderId"),
    ("loyaltyTransactions", "Points ledger: userId, type (earned/redeemed), amount, description, orderId"),
    ("consents", "Consent requests: orderId, type, description, amount, status, expiresAt"),
    ("vendorPayouts", "Payout records: vendorId, orderId, amount, status, processedAt"),
    ("driverPayouts", "Driver payout records: driverId, orderId, amount, status"),
    ("promoCodes", "Promo codes: code, type, discountValue, maxUses, usedCount, isActive, expiresAt"),
    ("subscriptions", "Subscription tiers defined as constants: Basic $9.99, Premium $19.99, Business $49.99"),
]

db_data = [[Paragraph("Table", s_table_header), Paragraph("Description", s_table_header)]]
for tname, tdesc in db_tables:
    db_data.append([Paragraph(f"<b>{tname}</b>", s_table_cell_sm), Paragraph(tdesc, s_table_cell_sm)])
dbt = Table(db_data, colWidths=[110, CONTENT_W - 110], repeatRows=1)
dbt.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), DARK_BG),
    ("GRID", (0, 0), (-1, -1), 0.4, BORDER_LIGHT),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
] + [("BACKGROUND", (0, i), (-1, i), ROW_ALT) for i in range(2, len(db_data), 2)]))
story.append(dbt)
story.append(Spacer(1, 10))

story.append(Paragraph("Technical Stack", s_h2))
stack_items = [
    ("<b>Frontend:</b> React 18 + Vite + TypeScript + Tailwind CSS v3 + shadcn/ui component library + Recharts (charts) + TanStack Query v5 (data fetching) + wouter (hash-based routing)",),
    ("<b>Backend:</b> Express.js + Drizzle ORM + better-sqlite3 (SQLite database)",),
    ("<b>Styling:</b> Violet primary (#7C5CFC), Inter font family, dark mode as primary theme with light mode supported via CSS class toggle",),
    ("<b>Scale:</b> 43 page files, 88 API endpoints, ~4,200 lines of backend logic, ~486 lines of schema definition",),
    ("<b>Key configurations:</b> SLA tiers (4 levels), loyalty tiers (4 levels with multipliers), subscription tiers (3 levels), bag pricing (4 sizes), surge factors (time/day/holiday/demand) — all defined as typed constants",),
]
for item in stack_items:
    story.append(Paragraph(f"• {item[0]}", s_body))
story.append(Spacer(1, 4))

story.append(PageBreak())

# ── I. FEATURE STATUS MATRIX ────────────────────────────────────────
story.append(Paragraph("I. Complete Feature Status Matrix — Works vs Partial vs Stub", s_h1))
story.append(Paragraph(
    "Definitive table showing the status of every feature area. <b>WORKS</b> = fully functional end-to-end. "
    "<b>PARTIAL</b> = frontend works but backend is incomplete, or vice versa. "
    "<b>STUB</b> = UI exists but clicking does nothing meaningful.",
    s_body))
story.append(Spacer(1, 6))

matrix = [
    # Login & Auth
    ("Login &amp; Auth", "Demo login (5 roles)", "WORKS", "Fully functional"),
    ("Login &amp; Auth", "Email/password login", "WORKS", "Works but passwords stored in plaintext"),
    ("Login &amp; Auth", "Registration", "WORKS", "Functional; phone missing country code prefix"),
    ("Login &amp; Auth", "Role-based routing", "WORKS", "Each role routes to correct dashboard"),
    ("Login &amp; Auth", "Forgot Password", "STUB", "Button exists, no handler"),
    ("Login &amp; Auth", "Google OAuth", "STUB", "Button exists, no handler"),
    ("Login &amp; Auth", "Sign-out", "PARTIAL", "Navigates away but doesn't clear session"),
    # Customer
    ("Customer", "Home page (greeting, tracker, vendors)", "WORKS", "All sections functional"),
    ("Customer", "Order scheduling flow", "WORKS", "Full flow: address, bags, speed, pricing, submit"),
    ("Customer", "Orders list + filtering", "WORKS", "All tabs and filters work"),
    ("Customer", "Order detail + timeline", "WORKS", "Timeline, pricing, status, actions all work"),
    ("Customer", "Contact Support dialog", "STUB", "Collects message but discards it — no API call"),
    ("Customer", "Loyalty rewards", "WORKS", "Tiers, points, redemption, history all work"),
    ("Customer", "Referral program", "WORKS", "Code sharing, tracking, rewards all work"),
    ("Customer", "AI Chat assistant", "WORKS", "8-category intent detection, context-aware responses"),
    ("Customer", "Profile — view/edit info", "PARTIAL", "Works but hardcoded to userId=1"),
    ("Customer", "Addresses CRUD", "PARTIAL", "Full CRUD but hardcoded to userId=1"),
    ("Customer", "Payment methods", "PARTIAL", "Add/delete/default work; edit is stub; hardcoded userId=1"),
    ("Customer", "Notifications", "WORKS", "Unread count, list, mark-as-read all work"),
    # Driver
    ("Driver", "Dashboard", "PARTIAL", "Content works but crashes on auth state change (Hooks)"),
    ("Driver", "Earnings + chart", "PARTIAL", "Same Hooks crash issue"),
    ("Driver", "Availability status toggle", "PARTIAL", "Status/zones/maxTrips save; schedule prefs don't save"),
    ("Driver", "Optimized route view", "PARTIAL", "Displays correctly; 'Mark Done' is client-only stub"),
    ("Driver", "Order detail + status advance", "WORKS", "Bag confirmation, status lifecycle all work"),
    ("Driver", "Navigation", "PARTIAL", "Map sim works; wrong address for delivery stops"),
    # Staff
    ("Staff", "Orders dashboard", "WORKS", "Stats, order list, action buttons all work"),
    ("Staff", "AI Queue", "WORKS", "Priority sorting, SLA countdown, actions all work"),
    ("Staff", "Quality control", "STUB", "UI renders but submit has no API call"),
    ("Staff", "Weigh &amp; Photo (intake)", "WORKS", "Weight recording and status advance work"),
    ("Staff", "Start Washing workflow", "WORKS", "Full wash → output → pack → ready flow"),
    ("Staff", "Active orders monitoring", "WORKS", "Grouped view with advance buttons works"),
    # Manager
    ("Manager", "Orders overview", "PARTIAL", "List/search/filters work; View Details button is dead"),
    ("Manager", "Payouts management", "STUB", "Revenue display works; Process Payout buttons do nothing"),
    # Admin
    ("Admin", "Dashboard overview", "WORKS", "KPIs, pipeline, revenue chart, activity feed all work"),
    ("Admin", "Orders management", "WORKS", "Full CRUD, status transitions, timeline, CSV export"),
    ("Admin", "Vendors management", "WORKS", "List, add, toggle status, adjust capacity all work"),
    ("Admin", "Drivers management", "WORKS", "List, add, status change, stats all work"),
    ("Admin", "Disputes management", "WORKS", "List, investigate, resolve, close, AI suggestions all work"),
    ("Admin", "Analytics dashboard", "PARTIAL", "Charts render but data is random (Math.random); trends hardcoded"),
    ("Admin", "Vendor Health Scoring", "WORKS", "Scoreboard, deep-dive, AI recommendations all work"),
    ("Admin", "Promo Codes", "PARTIAL", "Create/toggle work; edit dialog has uncontrolled Select bug"),
    ("Admin", "Financial Reports", "PARTIAL", "Summary and breakdown work; monthly trend uses random data"),
    ("Admin", "Fraud Detection", "PARTIAL", "Detection works; clear/escalate are stubs (not persisted)"),
    # Backend
    ("Backend", "Pricing Engine", "WORKS", "Full bag pricing, speed multipliers, tax calculation"),
    ("Backend", "Auto-Dispatch (Vendor+Driver)", "WORKS", "Multi-factor scoring and assignment"),
    ("Backend", "SLA Engine", "WORKS", "4 tiers, warnings, breach detection, background monitoring"),
    ("Backend", "Surge Pricing", "WORKS", "Time/day/holiday/demand factors"),
    ("Backend", "Loyalty Engine", "WORKS", "Tiers, points, multipliers, subscriptions"),
    ("Backend", "Financial Engine", "PARTIAL", "Works but ignores configurable payout rates"),
    ("Backend", "AI Chatbot Engine", "WORKS", "Intent detection, context, escalation"),
    ("Backend", "Vendor Health Scoring", "WORKS", "5-factor scoring with recommendations"),
    ("Backend", "Fraud Detection Engine", "PARTIAL", "Detection works; persist clear/escalate doesn't"),
    ("Backend", "Predictive ETA", "PARTIAL", "Works but crashes on missing coordinates"),
    ("Backend", "Consent System", "WORKS", "Full flow with auto-approval timeout"),
    ("Backend", "Audit Trail", "WORKS", "Complete event logging per order"),
    ("Backend", "Notification System", "WORKS", "Create, query, unread count, mark-read"),
    ("Backend", "Background Tasks", "WORKS", "Consent timeout (60s) + SLA checker (2min)"),
]

# Build the matrix table
matrix_header = [
    Paragraph("Area", s_table_header),
    Paragraph("Feature", s_table_header),
    Paragraph("Status", s_table_header),
    Paragraph("Notes", s_table_header),
]
matrix_rows = [matrix_header]
for area, feature, status, notes in matrix:
    matrix_rows.append([
        Paragraph(area, s_table_cell_sm),
        Paragraph(feature, s_table_cell_sm),
        Paragraph(status, status_style(status)),
        Paragraph(notes, s_table_cell_sm),
    ])

mt = Table(matrix_rows, colWidths=[72, 155, 50, 225], repeatRows=1)
mt_style_cmds = [
    ("BACKGROUND", (0, 0), (-1, 0), DARK_BG),
    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
    ("GRID", (0, 0), (-1, -1), 0.4, BORDER_LIGHT),
    ("TOPPADDING", (0, 0), (-1, -1), 3),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("FONTSIZE", (0, 0), (-1, -1), 7.5),
]
for i in range(1, len(matrix_rows)):
    if i % 2 == 0:
        mt_style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
mt.setStyle(TableStyle(mt_style_cmds))
story.append(mt)

# Status summary counts
works_count = sum(1 for _, _, s, _ in matrix if s == "WORKS")
partial_count = sum(1 for _, _, s, _ in matrix if s == "PARTIAL")
stub_count = sum(1 for _, _, s, _ in matrix if s == "STUB")

story.append(Spacer(1, 10))
summary_final = [
    [Paragraph("Status", s_table_header), Paragraph("Count", s_table_header), Paragraph("Percentage", s_table_header)],
    [Paragraph("WORKS", s_works), Paragraph(str(works_count), s_table_cell),
     Paragraph(f"{works_count*100/len(matrix):.0f}%", s_table_cell)],
    [Paragraph("PARTIAL", s_partial), Paragraph(str(partial_count), s_table_cell),
     Paragraph(f"{partial_count*100/len(matrix):.0f}%", s_table_cell)],
    [Paragraph("STUB", s_stub), Paragraph(str(stub_count), s_table_cell),
     Paragraph(f"{stub_count*100/len(matrix):.0f}%", s_table_cell)],
    [Paragraph("<b>Total Features</b>", s_table_cell), Paragraph(f"<b>{len(matrix)}</b>", s_table_cell),
     Paragraph("<b>100%</b>", s_table_cell)],
]
sft = Table(summary_final, colWidths=[100, 60, 80])
sft.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), DARK_BG),
    ("GRID", (0, 0), (-1, -1), 0.4, BORDER_LIGHT),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("BACKGROUND", (0, -1), (-1, -1), VIOLET_LIGHT),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("ALIGN", (1, 0), (-1, -1), "CENTER"),
]))
story.append(sft)

# ── Build ───────────────────────────────────────────────────────────
doc.build(story, onFirstPage=first_page, onLaterPages=header_footer)
print(f"✓ PDF saved to {OUTPUT}")
print(f"  Total bugs: {total} (Critical: {len(critical_bugs)}, High: {len(high_bugs)}, Medium: {len(medium_bugs)}, Low: {len(low_bugs)})")
print(f"  Feature matrix: {len(matrix)} features (WORKS: {works_count}, PARTIAL: {partial_count}, STUB: {stub_count})")
