#!/usr/bin/env python3
"""
OFFLOAD — Production Readiness & Feature Roadmap PDF Generator
Executive-quality document for Chaim Fischer
"""

import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor, Color, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable, ListFlowable, ListItem, Flowable
)
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.lib import colors

# ─── COLORS ───────────────────────────────────────────────────────────
TEAL = HexColor("#01696F")
TEAL_LIGHT = HexColor("#E8F5F6")
TEAL_DARK = HexColor("#014E53")
PURPLE = HexColor("#5B4DC7")
PURPLE_LIGHT = HexColor("#F0EDFB")
BG_LIGHT = HexColor("#F7F6F2")
BG_WHITE = HexColor("#FFFFFF")
TEXT_DARK = HexColor("#1C1B19")
TEXT_BODY = HexColor("#28251D")
TEXT_MUTED = HexColor("#5A5957")
TEXT_FAINT = HexColor("#7A7974")
BORDER_LIGHT = HexColor("#D4D1CA")
SURFACE = HexColor("#F9F8F5")
RED_ACCENT = HexColor("#A13544")
GREEN_ACCENT = HexColor("#437A22")
ORANGE_ACCENT = HexColor("#DA7101")
ROW_ALT = HexColor("#F5F4F0")

# ─── FONTS ────────────────────────────────────────────────────────────
FONT_DIR = "/tmp/fonts"

pdfmetrics.registerFont(TTFont("Inter", os.path.join(FONT_DIR, "Inter-Regular-400.ttf")))
pdfmetrics.registerFont(TTFont("Inter-Bold", os.path.join(FONT_DIR, "Inter-Bold-700.ttf")))
pdfmetrics.registerFont(TTFont("Inter-SemiBold", os.path.join(FONT_DIR, "Inter-SemiBold-600.ttf")))
pdfmetrics.registerFont(TTFont("Inter-Medium", os.path.join(FONT_DIR, "Inter-Medium-500.ttf")))
pdfmetrics.registerFont(TTFont("DMSans-Bold", os.path.join(FONT_DIR, "DMSans-700.ttf")))
pdfmetrics.registerFont(TTFont("DMSans-Regular", os.path.join(FONT_DIR, "DMSans-400.ttf")))
pdfmetrics.registerFont(TTFont("DMSans-SemiBold", os.path.join(FONT_DIR, "DMSans-600.ttf")))

# ─── STYLES ───────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

# Cover styles
cover_title = ParagraphStyle(
    "CoverTitle", fontName="DMSans-Bold", fontSize=36, leading=42,
    textColor=TEAL_DARK, alignment=TA_LEFT, spaceAfter=8
)
cover_subtitle = ParagraphStyle(
    "CoverSubtitle", fontName="Inter", fontSize=14, leading=20,
    textColor=TEXT_MUTED, alignment=TA_LEFT, spaceAfter=6
)
cover_meta = ParagraphStyle(
    "CoverMeta", fontName="Inter", fontSize=11, leading=16,
    textColor=TEXT_FAINT, alignment=TA_LEFT
)

# Section heading
section_heading = ParagraphStyle(
    "SectionHeading", fontName="DMSans-Bold", fontSize=22, leading=28,
    textColor=TEAL_DARK, spaceBefore=16, spaceAfter=10
)
# Sub heading
sub_heading = ParagraphStyle(
    "SubHeading", fontName="DMSans-SemiBold", fontSize=14, leading=18,
    textColor=TEXT_DARK, spaceBefore=14, spaceAfter=6
)
# Sub sub heading
subsub_heading = ParagraphStyle(
    "SubSubHeading", fontName="Inter-SemiBold", fontSize=11, leading=15,
    textColor=TEAL, spaceBefore=10, spaceAfter=4
)

# Body
body_style = ParagraphStyle(
    "Body", fontName="Inter", fontSize=9.5, leading=14.5,
    textColor=TEXT_BODY, alignment=TA_JUSTIFY, spaceAfter=6
)
# Body bold
body_bold = ParagraphStyle(
    "BodyBold", fontName="Inter-Bold", fontSize=9.5, leading=14.5,
    textColor=TEXT_BODY, spaceAfter=6
)
# Bullet
bullet_style = ParagraphStyle(
    "Bullet", fontName="Inter", fontSize=9.5, leading=14,
    textColor=TEXT_BODY, leftIndent=20, bulletIndent=8,
    spaceAfter=3, bulletFontName="Inter", bulletFontSize=9.5
)
# Callout
callout_style = ParagraphStyle(
    "Callout", fontName="Inter-Medium", fontSize=9.5, leading=14,
    textColor=TEAL_DARK, leftIndent=12, rightIndent=12,
    spaceBefore=6, spaceAfter=6, borderPadding=8,
    backColor=TEAL_LIGHT, borderColor=TEAL, borderWidth=0,
    borderRadius=4
)
# Footnote
footnote_style = ParagraphStyle(
    "Footnote", fontName="Inter", fontSize=7, leading=9.5,
    textColor=TEXT_FAINT, spaceAfter=2
)
# Table header text
table_header_style = ParagraphStyle(
    "TableHeader", fontName="Inter-SemiBold", fontSize=8.5, leading=11,
    textColor=white
)
# Table cell text
table_cell_style = ParagraphStyle(
    "TableCell", fontName="Inter", fontSize=8.5, leading=12,
    textColor=TEXT_BODY
)
table_cell_bold = ParagraphStyle(
    "TableCellBold", fontName="Inter-SemiBold", fontSize=8.5, leading=12,
    textColor=TEXT_BODY
)

# Phase label
phase_label = ParagraphStyle(
    "PhaseLabel", fontName="DMSans-Bold", fontSize=13, leading=17,
    textColor=TEAL, spaceBefore=10, spaceAfter=4
)
phase_subtitle = ParagraphStyle(
    "PhaseSubtitle", fontName="Inter-Medium", fontSize=10, leading=14,
    textColor=TEXT_MUTED, spaceAfter=6
)

# ─── HELPER FUNCTIONS ─────────────────────────────────────────────────

def make_table(headers, rows, col_widths=None, highlight_first_col=False):
    """Create a styled table with alternating rows."""
    hdr = [Paragraph(h, table_header_style) for h in headers]
    data = [hdr]
    for row in rows:
        styled_row = []
        for i, cell in enumerate(row):
            if i == 0 and highlight_first_col:
                styled_row.append(Paragraph(str(cell), table_cell_bold))
            else:
                styled_row.append(Paragraph(str(cell), table_cell_style))
        data.append(styled_row)

    avail_w = 468  # 6.5 inches
    if col_widths is None:
        n = len(headers)
        col_widths = [avail_w / n] * n

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), TEAL_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Inter-SemiBold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, 0), 1, TEAL),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, BORDER_LIGHT),
    ]
    # Alternating row backgrounds
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
    t.setStyle(TableStyle(style_cmds))
    return t


def make_callout(text):
    """Create a teal callout box."""
    data = [[Paragraph(text, callout_style)]]
    t = Table(data, colWidths=[468])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TEAL_LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("LINEBELOW", (0, 0), (-1, -1), 0, TEAL),
        ("BOX", (0, 0), (-1, -1), 1, TEAL),
    ]))
    return t


def bullet(text):
    return Paragraph(f"<bullet>&bull;</bullet> {text}", bullet_style)


def fn(n):
    """Inline footnote superscript."""
    return f'<super><font color="#01696F" size="7">{n}</font></super>'


class TealLine(Flowable):
    """A thin teal horizontal line."""
    def __init__(self, width=468, thickness=1.5):
        Flowable.__init__(self)
        self.width = width
        self.height = thickness + 4

    def draw(self):
        self.canv.setStrokeColor(TEAL)
        self.canv.setLineWidth(1.5)
        self.canv.line(0, 2, self.width, 2)


class GradientLine(Flowable):
    """A gradient line from teal to purple."""
    def __init__(self, width=468, thickness=3):
        Flowable.__init__(self)
        self.width = width
        self.height = thickness + 6

    def draw(self):
        steps = 100
        seg_w = self.width / steps
        for i in range(steps):
            r = 0.004 + (0.357 - 0.004) * i / steps
            g = 0.412 + (0.302 - 0.412) * i / steps
            b = 0.435 + (0.780 - 0.435) * i / steps
            self.canv.setStrokeColorRGB(r, g, b)
            self.canv.setLineWidth(3)
            x = i * seg_w
            self.canv.line(x, 3, x + seg_w + 1, 3)


# ─── PAGE TEMPLATE ────────────────────────────────────────────────────

def header_footer(canvas_obj, doc):
    canvas_obj.saveState()
    w, h = letter
    # Footer line
    canvas_obj.setStrokeColor(BORDER_LIGHT)
    canvas_obj.setLineWidth(0.5)
    canvas_obj.line(72, 42, w - 72, 42)
    # Page number
    canvas_obj.setFont("Inter", 7.5)
    canvas_obj.setFillColor(TEXT_FAINT)
    canvas_obj.drawString(72, 30, "OFFLOAD — Production Readiness & Feature Roadmap")
    canvas_obj.drawRightString(w - 72, 30, f"Page {doc.page}")
    canvas_obj.restoreState()

def cover_footer(canvas_obj, doc):
    """No standard header/footer on cover page."""
    pass


# ─── SOURCE MANAGEMENT ───────────────────────────────────────────────

SOURCES = {}
_source_counter = [0]

def cite(label, url):
    """Register a source and return footnote reference number."""
    key = url
    if key not in SOURCES:
        _source_counter[0] += 1
        SOURCES[key] = (_source_counter[0], label, url)
    return SOURCES[key][0]


def source_ref(label, url):
    """Return inline footnote markup."""
    n = cite(label, url)
    return fn(n)


# ─── BUILD DOCUMENT ──────────────────────────────────────────────────

OUTPUT = "/home/user/workspace/offload/research/offload_production_roadmap.pdf"

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=letter,
    title="OFFLOAD — Production Readiness & Feature Roadmap",
    author="Perplexity Computer",
    topMargin=72,
    bottomMargin=60,
    leftMargin=72,
    rightMargin=72,
)

story = []

# ═══════════════════════════════════════════════════════════════════════
# COVER PAGE
# ═══════════════════════════════════════════════════════════════════════

story.append(Spacer(1, 1.8 * inch))
story.append(GradientLine())
story.append(Spacer(1, 0.3 * inch))
story.append(Paragraph("OFFLOAD", ParagraphStyle(
    "CoverBrand", fontName="DMSans-Bold", fontSize=52, leading=56,
    textColor=TEAL_DARK
)))
story.append(Spacer(1, 0.08 * inch))
story.append(Paragraph("Production Readiness &amp; Feature Roadmap", ParagraphStyle(
    "CoverTitle2", fontName="DMSans-SemiBold", fontSize=22, leading=28,
    textColor=TEXT_DARK
)))
story.append(Spacer(1, 0.15 * inch))
story.append(Paragraph("Everything You Need to Build, Scale, and Ship", cover_subtitle))
story.append(Spacer(1, 0.6 * inch))
story.append(TealLine())
story.append(Spacer(1, 0.25 * inch))
story.append(Paragraph("April 14, 2026", cover_meta))
story.append(Spacer(1, 0.06 * inch))
story.append(Paragraph("Prepared for: <b>Chaim Fischer</b>  |  chaim.fischer@tudelu.com", cover_meta))
story.append(Spacer(1, 0.06 * inch))
story.append(Paragraph("Confidential  |  Internal Use Only", ParagraphStyle(
    "CoverConf", fontName="Inter-Medium", fontSize=9, textColor=TEXT_FAINT
)))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# EXECUTIVE SUMMARY
# ═══════════════════════════════════════════════════════════════════════

story.append(Paragraph("Executive Summary", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.15 * inch))

story.append(Paragraph(
    "This document is an honest, comprehensive technical blueprint for taking Offload from a working web prototype "
    "to a production-ready, App-Store-listed laundry logistics platform. It synthesizes research across real-time "
    "messaging, order tracking, pricing economics, AI capabilities, hardware integration, scalability patterns, "
    "and mobile deployment strategies — all grounded in how the market leaders (Poplin, Rinse, DoorDash, Uber) "
    "actually built their systems.", body_style))

story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("What Works Now", sub_heading))
story.append(bullet("The existing web application provides the foundational UI and business logic"))
story.append(bullet("React-based frontend is directly wrappable with Capacitor.js for iOS and Android — zero rewrite needed"))
story.append(bullet("WebSocket infrastructure (Socket.io) handles real-time messaging at MVP scale"))
story.append(bullet("PostgreSQL as the source of truth — battle-tested for order management and ACID guarantees"))

story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("What Needs to Be Built", sub_heading))
story.append(bullet("Complete 16-state order lifecycle state machine with enforced transitions and notifications"))
story.append(bullet("Weight-based pricing engine with customization add-ons (detergent, softener, rush)"))
story.append(bullet("Real-time GPS tracking with dual-path architecture (Redis for live map, event log for analytics)"))
story.append(bullet("In-app messaging between all role pairs: Customer-Driver, Customer-Support, Staff-Driver, Admin"))
story.append(bullet("AI voice ordering pipeline (OpenAI Realtime API) and conversational chatbot"))
story.append(bullet("Photo capture workflow for proof of pickup/delivery with GPS tagging"))
story.append(bullet("Bluetooth scale integration for driver weigh-ins (native BLE required for iOS)"))
story.append(bullet("Capacitor.js native wrapping + App Store submission pipeline"))

story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("What Needs External Services", sub_heading))
story.append(bullet("Stripe Connect account for 3-way payment splits (platform + laundromat + driver)"))
story.append(bullet("Apple Developer account ($99/yr) + Google Play account ($25 one-time)"))
story.append(bullet("Mapbox API keys for maps and directions (free tier covers MVP)"))
story.append(bullet("Firebase Cloud Messaging or OneSignal for push notifications"))
story.append(bullet("Twilio for transactional SMS ($0.0079/msg)"))
story.append(bullet("Domain, SSL, and hosting infrastructure (Railway/Render/Fly.io ~$20–50/mo)"))

story.append(Spacer(1, 0.15 * inch))
story.append(make_callout(
    "<b>Timeline:</b> 16 weeks from start to App Store submission. "
    "<b>Monthly infrastructure cost at MVP:</b> ~$100–300/month plus Stripe transaction fees. "
    "<b>Key insight:</b> Poplin, the market leader with 100K+ downloads, is literally a WebView wrapper — "
    "the bar for \"good enough\" is lower than you think."
))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# SECTION 1: REAL-TIME MESSAGING
# ═══════════════════════════════════════════════════════════════════════

# Cite sources upfront
s_uber = cite("Uber Engineering Blog", "https://www.uber.com/blog/building-scalable-real-time-chat/")
s_doordash = cite("System Design Handbook: DoorDash", "https://www.systemdesignhandbook.com/guides/doordash-system-design-interview/")
s_ably = cite("Ably: Scaling WebSockets", "https://ably.com/topic/the-challenge-of-scaling-websockets")
s_pkgpulse = cite("PkgPulse: Realtime Libraries 2026", "https://www.pkgpulse.com/blog/best-realtime-libraries-2026")
s_clix = cite("Clix Blog: Push Notification Delivery", "https://blog.clix.so/how-push-notification-delivery-works-internally/")
s_connectycube = cite("ConnectyCube: WebSockets vs Firebase", "https://connectycube.com/2025/07/17/websockets-vs-firebase-which-is-best-for-real-time-chat/")

story.append(Paragraph("1. Real-Time Messaging", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.12 * inch))

story.append(Paragraph(
    f"Every successful logistics platform — Uber, DoorDash, Instacart — uses WebSockets for real-time bidirectional "
    f"communication.{fn(s_uber)}{fn(s_doordash)} The universal pattern is: clients connect via WebSocket to a gateway, "
    f"which routes messages through a backend event bus to the appropriate recipients. When a user is offline, "
    f"push notifications (FCM/APNs) take over.{fn(s_clix)}", body_style))

story.append(Paragraph("Message Flow Directions", sub_heading))
story.append(Paragraph(
    "A laundry platform requires messaging between every combination of roles. Each channel serves a distinct purpose:", body_style))

story.append(make_table(
    ["Channel", "Use Cases", "Priority"],
    [
        ["Customer ↔ Driver", "Pickup instructions, gate codes, \"I'm outside\", delivery coordination", "Critical"],
        ["Customer ↔ Support", "Order issues, damage claims, billing disputes, general help", "Critical"],
        ["Staff ↔ Driver", "Facility coordination, bag handoff, schedule changes", "High"],
        ["Manager ↔ Everyone", "Oversight, escalation handling, quality control", "Medium"],
        ["Admin ↔ Everyone", "Platform announcements, policy updates, account issues", "Medium"],
    ],
    col_widths=[100, 238, 70],
    highlight_first_col=True
))

story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("Architecture Recommendation", sub_heading))
story.append(Paragraph(
    f"<b>MVP: Socket.io</b> — provides rooms, namespaces, automatic reconnection, and fallback transports "
    f"out of the box.{fn(s_pkgpulse)} A single Node.js process handles 50K–100K concurrent connections; "
    f"with kernel tuning, up to 240K at sub-50ms latency.{fn(s_ably)}", body_style))
story.append(Paragraph(
    "<b>Migration path:</b> At growth stage (500–50K concurrent), add the Socket.io Redis adapter for "
    "horizontal scaling across multiple servers. At scale (50K+), evaluate Kafka-backed fanout or managed "
    "WebSocket infrastructure (Ably) for geo-distributed clusters.", body_style))

story.append(Paragraph("Technology Comparison", sub_heading))
story.append(make_table(
    ["Technology", "Best For", "Free Tier", "Scalability"],
    [
        ["Socket.io", "Rapid prototyping, rooms/namespaces", "Self-hosted", "Redis adapter at scale"],
        ["Firebase Realtime DB", "Zero-backend MVP, offline sync", "Generous", "Auto-scales; costs spike"],
        ["Ably", "Production-grade, global edge", "6M msg/mo", "30+ data centers"],
        ["Pusher", "Simple notifications", "200 connections", "Limited outside US/EU"],
        ["Raw WebSocket", "Full control, low latency", "Self-hosted", "Requires Redis pub/sub"],
    ],
    col_widths=[95, 150, 95, 128]
))

story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("Notification Rules per Status Transition", sub_heading))
story.append(Paragraph(
    "Every state change in the order lifecycle triggers targeted notifications. Push payload should contain "
    f"only conversation_id, sender_id, and event type — not message content — to avoid payload size limits and "
    f"ensure consistency.{fn(s_clix)}", body_style))

story.append(make_table(
    ["Status", "Customer Notification", "Driver Notification"],
    [
        ["SCHEDULED", "\"Your order is confirmed. Pickup window: 2–4pm\"", "\"New job accepted\""],
        ["DRIVER_EN_ROUTE_PICKUP", "\"Your driver is on the way! ETA: 12 min\"", "Turn-by-turn nav"],
        ["ARRIVED_PICKUP", "\"Your driver has arrived\"", "Prompt to confirm pickup"],
        ["PICKED_UP", "\"Your laundry is picked up\"", "Navigate to facility"],
        ["PROCESSING_STARTED", "\"Your laundry has arrived at facility\"", "—"],
        ["READY_FOR_DELIVERY", "\"Your laundry is clean and ready!\"", "New delivery assignment"],
        ["DRIVER_EN_ROUTE_DELIVERY", "\"Your laundry is on its way! ETA: 18 min\"", "Turn-by-turn nav"],
        ["DELIVERED", "\"Delivery complete! Rate your experience.\"", "Job complete, payment processed"],
    ],
    col_widths=[120, 195, 153],
    highlight_first_col=True
))

story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("Read Receipts &amp; Message Persistence", sub_heading))
story.append(Paragraph(
    "Messages are stored in PostgreSQL with conversation threading. Each message tracks delivered_at and read_at "
    "timestamps. When the recipient opens the conversation, a READ event fires via WebSocket, updating the sender's "
    f"UI in real time. When offline, FCM stores undelivered push notifications for up to 4 weeks.{fn(s_clix)}", body_style))

# Footnotes for section 1
story.append(Spacer(1, 0.15 * inch))
story.append(HRFlowable(width="100%", color=BORDER_LIGHT))
story.append(Spacer(1, 4))
for key, (num, label, url) in sorted(SOURCES.items(), key=lambda x: x[1][0]):
    if num <= s_connectycube:
        story.append(Paragraph(
            f'{num}. {label} — <a href="{url}" color="#01696F">{url}</a>', footnote_style))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# SECTION 2: ORDER TRACKING & STATUS MACHINE
# ═══════════════════════════════════════════════════════════════════════

s_redis_kafka = cite("LinkedIn: Kafka + Redis for Delivery Tracking", "https://www.linkedin.com/posts/rohith-addula_kafka-redis-systemdesign-activity-7439099582011207680-LIKr")
s_uber_tracking = cite("DEV: Uber Live Tracking Architecture", "https://dev.to/meeth_gangwar_f56b17f5aff/the-architecture-behind-uber-live-tracking-5bbm")
s_mapbox = cite("AllFront: Mapbox vs Google Maps", "https://allfront.io/blog/mapbox-vs-google-maps/")
s_redis_geo = cite("Redis Geo Commands", "https://redis.io/docs/data-types/geospatial/")
s_nagarro = cite("Nagarro: Geofencing in Logistics", "https://www.nagarro.com/en/blog/geofencing-technology-logistics")

story.append(Paragraph("2. Order Tracking &amp; Status Machine", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.12 * inch))

story.append(Paragraph(
    "Laundry logistics requires a more complex order lifecycle than food delivery — it includes a "
    "facility processing step (wash/dry/fold) that food delivery lacks. The complete state machine "
    f"has 16 states plus 2 terminal states (CANCELLED, COMPLETED).{fn(s_doordash)}", body_style))

story.append(Paragraph("Complete 16-State FSM", sub_heading))

# State flow as a compact table
fsm_states = [
    ["1. PENDING", "Order created, awaiting payment", "Customer"],
    ["2. SCHEDULED", "Payment confirmed, awaiting driver", "System"],
    ["3. DRIVER_EN_ROUTE_PICKUP", "Driver accepted, heading to customer", "Driver"],
    ["4. ARRIVED_PICKUP", "Driver at customer address (geofence)", "System/Driver"],
    ["5. PICKED_UP", "Customer hands over laundry", "Driver"],
    ["6. DRIVER_EN_ROUTE_FACILITY", "Driver heading to facility", "System"],
    ["7. AT_FACILITY", "Driver arrives at facility (geofence)", "System"],
    ["8. PROCESSING_STARTED", "Laundry checked in, weighed, tagged", "Staff"],
    ["9. WASHING", "Wash cycle begins", "Staff"],
    ["10. DRYING", "Dry cycle begins", "Staff"],
    ["11. FOLDING", "Folding and packaging", "Staff"],
    ["12. READY_FOR_DELIVERY", "Clean laundry ready for pickup", "Staff"],
    ["13. DRIVER_EN_ROUTE_DELIVERY", "Driver heading to customer", "Driver"],
    ["14. ARRIVED_DELIVERY", "Driver at customer address (geofence)", "System"],
    ["15. DELIVERED", "Customer receives laundry", "Driver"],
    ["16. COMPLETED", "Payment settled, order closed", "System"],
]

story.append(make_table(
    ["State", "Description", "Triggered By"],
    fsm_states,
    col_widths=[160, 220, 88],
    highlight_first_col=True
))

story.append(Spacer(1, 0.06 * inch))
story.append(Paragraph(
    "Each transition is enforced by a backend FSM validator with optimistic concurrency control in PostgreSQL. "
    "Invalid transitions are rejected, and every status change is recorded in an order_status_history audit table.", body_style))

story.append(Paragraph("Real-Time GPS Tracking Architecture", sub_heading))
story.append(Paragraph(
    f"The critical architectural insight: <b>don't route GPS through Kafka for the live map</b>. Kafka adds "
    f"50–500ms latency per update due to disk writes and replication.{fn(s_redis_kafka)} The correct production "
    f"pattern is <b>dual-path</b>:", body_style))
story.append(bullet(f"<b>Hot path:</b> Driver GPS → Redis Pub/Sub → WebSocket → Customer map (&lt;20ms latency){fn(s_uber_tracking)}"))
story.append(bullet("<b>Cold path:</b> Driver GPS → Kafka → Analytics, billing, audit logs (async, latency irrelevant)"))

story.append(Spacer(1, 0.06 * inch))
story.append(Paragraph("GPS Update Frequency", subsub_heading))
story.append(make_table(
    ["Scenario", "Interval", "Rationale"],
    [
        ["Driver on route to pickup", "Every 5 seconds", "Moderate accuracy needed"],
        ["Driver within 0.5km of customer", "Every 2 seconds", "Arrival imminent"],
        ["Driver stationary / waiting", "Every 30 seconds", "Battery conservation"],
        ["App in background", "Every 15 seconds", "OS background restrictions"],
    ],
    col_widths=[170, 100, 198]
))

story.append(Spacer(1, 0.06 * inch))
story.append(Paragraph("Geofencing Rules", subsub_heading))
story.append(Paragraph(
    f"Virtual boundaries around key locations trigger automatic status transitions.{fn(s_nagarro)} "
    f"Redis Geo commands (GEOADD, GEODIST, GEORADIUS) handle O(N+log M) spatial queries without PostGIS.{fn(s_redis_geo)}", body_style))
story.append(make_table(
    ["Location", "Radius", "Trigger"],
    [
        ["Customer pickup address", "100m", "\"Driver is here!\" notification → ARRIVED_PICKUP"],
        ["Laundry facility", "200m", "Auto-transition → AT_FACILITY"],
        ["Customer delivery address", "100m", "\"Arriving soon\" push → ARRIVED_DELIVERY"],
    ],
    col_widths=[150, 60, 258]
))

story.append(Spacer(1, 0.06 * inch))
story.append(Paragraph("ETA Calculation", subsub_heading))
story.append(Paragraph(
    f"Use <b>Mapbox Directions API</b> for ETA — 100K free requests/month vs. Google's smaller allotment, "
    f"and 60% cheaper at scale ($2/1K vs $5/1K).{fn(s_mapbox)} Recalculate when driver moves &gt;200m or every "
    "60 seconds. Cache in Redis with 90-second TTL. Broadcast updated ETA via WebSocket.", body_style))

# Footnotes for section 2
story.append(Spacer(1, 0.15 * inch))
story.append(HRFlowable(width="100%", color=BORDER_LIGHT))
story.append(Spacer(1, 4))
for key, (num, label, url) in sorted(SOURCES.items(), key=lambda x: x[1][0]):
    if s_connectycube < num <= s_nagarro:
        story.append(Paragraph(
            f'{num}. {label} — <a href="{url}" color="#01696F">{url}</a>', footnote_style))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# SECTION 3: PRICING MODEL & CUSTOMIZATIONS
# ═══════════════════════════════════════════════════════════════════════

s_poplin = cite("Poplin.co Pricing", "https://poplin.co/blog/how-much-does-poplin-cost-lets-talk-dollars-and-pounds")
s_rinse = cite("Rinse.com Pricing", "https://www.rinse.com/pricing")
s_hampr = cite("Hampr Pricing", "https://www.tryhampr.com/pricing/")
s_columbia = cite("Columbia Pike Laundry Pricing Guide", "https://www.columbiapikelaundry.com/post/per-pound-laundry-pricing-guide-en")
s_toddlayne = cite("Todd Layne Cleaners NYC", "https://toddlaynecleaners.com/how-much-should-wash-and-fold-laundry-cost-in-nyc/")
s_techcrunch = cite("TechCrunch: Marketplace Take Rates", "https://techcrunch.com/2021/11/17/4-strategies-for-setting-marketplace-take-rates/")
s_sidehusl = cite("Sidehusl: Poplin Review", "https://sidehusl.com/poplin/")
s_ultrasoap = cite("Ultra Soap Direct", "https://ultrasoapdirect.com")
s_sharetribe = cite("Sharetribe: Laundry Marketplace Guide", "https://www.sharetribe.com/create/how-to-build-marketplace-for-laundry-services/")

story.append(Paragraph("3. Pricing Model &amp; Customizations", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.12 * inch))

story.append(Paragraph(
    f"Weight-based pricing (price per pound) is the dominant model for wash &amp; fold services in the U.S., "
    f"with the standard range at $1.75–$3.50/lb for pickup &amp; delivery.{fn(s_columbia)} "
    f"Laundry is always weighed <b>after drying</b> — never wet — to prevent water-weight overcharging.{fn(s_poplin)}", body_style))

story.append(Paragraph("Competitor Comparison", sub_heading))

story.append(make_table(
    ["Platform", "Model", "Standard", "Express", "Min Order", "Platform Cut"],
    [
        ["Poplin", "Gig marketplace", "$1.00/lb", "$2.00/lb", "$30", "25%"],
        ["Rinse", "Managed service", "$3.29/lb PAYG", "+$9.95 rush", "$30/bag", "~30–40%"],
        ["Hampr", "Gig marketplace", "~$1–2.50/load", "N/A", "$15–25", "30%"],
        ["Cleanly (defunct)", "Managed", "$1.60/lb", "+$5.99", "$30", "~30–40%"],
        ["Washio (defunct)", "Managed", "$2.15/lb", "N/A", "$30", "~30–40%"],
        ["Typical Urban", "Direct", "$1.75–2.50/lb", "+25–50%", "$30–50", "N/A"],
    ],
    col_widths=[75, 80, 75, 65, 65, 65],
    highlight_first_col=True
))

story.append(Spacer(1, 0.06 * inch))
story.append(Paragraph(
    f"Sources: Poplin{fn(s_poplin)}, Rinse{fn(s_rinse)}, Hampr{fn(s_hampr)}, Sidehusl{fn(s_sidehusl)}", footnote_style))

story.append(Paragraph("Customization Menu with Margins", sub_heading))
story.append(Paragraph(
    f"Customization add-ons are extremely high-margin. The actual cost difference between standard and "
    f"premium detergent is $0.10–$0.30/load, while customers pay $2–$5.{fn(s_ultrasoap)}", body_style))

story.append(make_table(
    ["Add-On", "Customer Price", "Actual Cost", "Gross Margin", "Platform Net (25%)"],
    [
        ["Hypoallergenic detergent", "$3.00/order", "$0.20", "93%", "$0.75"],
        ["Brand-name upgrade (Tide)", "$2.50/order", "$0.15", "94%", "$0.63"],
        ["Fabric softener", "$1.50/order", "$0.15", "90%", "$0.38"],
        ["OxiClean add-on", "$1.50/order", "$0.25", "83%", "$0.38"],
        ["Bleach (whites)", "$1.25/order", "$0.10", "92%", "$0.31"],
        ["Hang dry", "$1.00/item", "$0.05", "95%", "$0.25"],
        ["Stain treatment", "$5.00/garment", "$0.75", "85%", "$1.25"],
        ["Rush / Express", "2x base rate", "+$0.15/lb", "~85%", "25% of premium"],
    ],
    col_widths=[110, 80, 68, 68, 90],
    highlight_first_col=True
))

story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("Recommended Take Rate", sub_heading))
story.append(Paragraph(
    f"The framework from TechCrunch's marketplace analysis is clear: \"Maximizing take rate is not the goal. "
    f"A higher take rate leads to lower transaction volume.\"{fn(s_techcrunch)} Launch at 15–18% to undercut "
    f"Poplin (25%) and Hampr (30%), then scale to 20–25% as network effects justify the increase.{fn(s_sharetribe)}", body_style))

story.append(make_table(
    ["Stage", "Take Rate", "Worker Keeps", "Rationale"],
    [
        ["Launch / Pre-scale", "15–18%", "82–85%", "Attract supply; undercut Poplin/Hampr"],
        ["Growth", "18–22%", "78–82%", "Increasing value-add; scheduling, insurance"],
        ["Scale / Dominant", "22–25%", "75–78%", "Network effect moat; full platform value"],
    ],
    col_widths=[100, 68, 80, 220],
    highlight_first_col=True
))

story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("Per-Order Economics Example", sub_heading))
story.append(Paragraph(
    "Scenario: Customer orders 20 lbs at $2.00/lb + hypoallergenic detergent ($3.00)", body_bold))
story.append(make_table(
    ["Line Item", "Amount"],
    [
        ["Base service (20 lbs x $2.00)", "$40.00"],
        ["Hypoallergenic upgrade", "$3.00"],
        ["Total customer pays", "$43.00"],
        ["Platform take (25% of $43)", "$10.75"],
        ["Laundromat/Washer gross (75%)", "$32.25"],
        ["Laundromat costs (detergent, utilities, labor, bags)", "~$8.15"],
        ["Laundromat net profit", "~$24.10"],
        ["Platform net (after tech/ops ~15%)", "~$5–7 per order"],
    ],
    col_widths=[300, 168],
    highlight_first_col=True
))

story.append(Spacer(1, 0.06 * inch))
story.append(make_callout(
    "<b>Rush/Express is the single best upsell in the business.</b> Poplin charges 2x the base rate for express "
    "($2/lb vs $1/lb). The incremental cost is ~$0.15/lb (labor reallocation). Nearly all the additional revenue "
    "falls straight to gross profit."
))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# SECTION 4: AI FEATURES
# ═══════════════════════════════════════════════════════════════════════

s_openai_rt = cite("OpenAI Realtime API", "https://openai.com/index/introducing-the-realtime-api/")
s_openai_ws = cite("OpenAI Realtime WebSocket Docs", "https://developers.openai.com/api/docs/guides/realtime-websocket")
s_gladia = cite("Gladia: Whisper vs Google STT", "https://www.gladia.io/blog/openai-whisper-vs-google-speech-to-text-vs-amazon-transcribe")
s_stanford = cite("Stanford: Laundry Classification 99.5%", "https://jamesbraza.com/projects/laundry-classification/")
s_edge = cite("Edge Impulse: Weight from Photos", "https://www.edgeimpulse.com/blog/estimate-weight-from-a-photo-using-visual-regression-in-edge-impulse/")
s_laundrapp = cite("Laundrapp Alexa Skill", "https://developer.amazon.com/blogs/alexa/post/77c76619-f702-4276-b30a-9a4814161bcb/with-laundrapp-s-alexa-skill-customers-simply-ask-alexa-to-take-care-of-the-laundry")
s_noscrubs = cite("NoScrubs AI Laundry", "https://www.smdp.com/ai-powered-laundry-service-noscrubs-launches-in-santa-monica-with-4-hour-turnaround/")
s_sirikit = cite("Apple Intelligence / SiriKit", "https://techcrunch.com/2024/06/10/apple-brings-apple-intelligence-to-developers-via-sirikit-and-app-intents/")
s_google_actions = cite("Google App Actions", "https://developers.google.com/assistant/app")
s_brightpoint = cite("Brightpoint: AI Defect Detection", "https://www.brightpoint.ai/post/ai-based-defect-detection-in-textile-and-garment-manufacturing")

story.append(Paragraph("4. AI Features", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.12 * inch))

story.append(Paragraph("Voice Ordering Pipeline", sub_heading))
story.append(Paragraph(
    f"The recommended approach is the <b>OpenAI Realtime API</b>, which handles the full voice pipeline "
    f"(STT + LLM reasoning + TTS) in a single WebSocket/WebRTC connection with GPT-4o.{fn(s_openai_rt)} "
    f"It supports function calling, meaning a voice assistant can directly trigger order placement, check "
    f"availability, and retrieve customer context — no separate NLP layer needed.{fn(s_openai_ws)}", body_style))
story.append(Paragraph(
    f"OpenAI Whisper achieves the lowest word error rate at 8.06%, significantly outperforming Google STT "
    f"(16–21%) and Amazon Transcribe (18–22%).{fn(s_gladia)}", body_style))

story.append(Paragraph("Voice Ordering Flow", subsub_heading))
story.append(bullet("User says: \"Pick up my laundry at 3pm tomorrow\""))
story.append(bullet("Realtime API extracts intent (schedule_pickup) + entities (time, address from saved profile)"))
story.append(bullet("Checks availability via function call to backend"))
story.append(bullet("Confirms: \"Pickup Thursday 2–4pm at 123 Main St. Shall I confirm?\""))
story.append(bullet("User says \"Yes\" → order created → confirmation sent"))
story.append(Paragraph(
    f"Cost: ~$0.06/min input audio. Average order takes &lt;2 minutes = ~$0.12/order.{fn(s_openai_rt)}", body_style))

story.append(Paragraph("Image Recognition for Garment ID", sub_heading))
story.append(Paragraph(
    f"A Stanford deep learning project achieved <b>99.5% accuracy</b> classifying laundry items using VGG16 "
    f"pretrained on ImageNet.{fn(s_stanford)} For fabric defect and stain detection, AI-based textile inspection "
    f"systems achieve 95%+ detection accuracy.{fn(s_brightpoint)}", body_style))
story.append(Paragraph(
    f"Competitor NoScrubs uses AI to itemize each garment from photos, verify correct address, "
    f"evaluate folding quality, and detect weight mismatches.{fn(s_noscrubs)}", body_style))

story.append(Paragraph("Weight Estimation from Photos — Honest Assessment", sub_heading))
story.append(Paragraph(
    f"Visual weight estimation is technically feasible but <b>limited for laundry bags</b>. Edge Impulse demonstrated "
    f"99% accuracy estimating rice weight from photos — but rice is uniform.{fn(s_edge)} Laundry has variable density "
    "(jeans vs. t-shirts), variable packing, and occlusion (can't see inside the bag).", body_style))
story.append(make_callout(
    "<b>Honest limitation:</b> Visual weight estimation for laundry is a rough guide only (±30–50%). "
    "Use it for customer expectations (\"Looks like ~8–12 lbs\"), but always confirm with a Bluetooth scale at pickup. "
    "After 3 orders, historical data per customer becomes more reliable than any vision model."
))

story.append(Paragraph("AI Chatbot for Full Order Control", sub_heading))
story.append(Paragraph(
    "An LLM-native chatbot (GPT-4o with function calling) replaces form-based ordering with conversational input. "
    "Users type or speak: \"I need my work clothes picked up Thursday — hang dry the button-downs this time.\" "
    "The AI extracts intent, queries saved preferences, checks availability, and confirms. Target, DoorDash, "
    "and Instacart already deploy this pattern via ChatGPT integrations.", body_style))

story.append(Paragraph("Voice Assistant Integration", sub_heading))
story.append(make_table(
    ["Platform", "Reach", "Dev Effort", "Best For"],
    [
        ["In-app (OpenAI Realtime)", "All users", "Medium", "Best experience, full control"],
        [f"Siri (App Intents)", "iOS users", "Medium", "iOS-first, Apple Intelligence benefits"],
        [f"Google Assistant", "Android users", "Low–Medium", "Quick integration via App Actions"],
        [f"Alexa Skills", "Smart speaker owners", "Medium", "Hands-free home use"],
    ],
    col_widths=[120, 80, 80, 188],
    highlight_first_col=True
))
story.append(Paragraph(
    f"Sources: SiriKit{fn(s_sirikit)}, Google App Actions{fn(s_google_actions)}, Laundrapp Alexa{fn(s_laundrapp)}", footnote_style))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# SECTION 5: HARDWARE INTEGRATION
# ═══════════════════════════════════════════════════════════════════════

s_wsi = cite("WSI: BLE Weighing Scales", "https://wsi-scales.com/index.php/ble-weighing-scales/")
s_bluetooth = cite("Bluetooth SIG: Weight Scale Service", "https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/WSS_v1.0.1/out/en/index-en.html")
s_webbluetooth = cite("TestMu AI: Web Bluetooth Compatibility", "https://www.testmuai.com/web-technologies/web-bluetooth/")
s_trackpod = cite("Track-POD: Proof of Delivery Apps", "https://www.track-pod.com/blog/proof-of-delivery-apps/")
s_timemark = cite("Timemark: GPS Delivery Photos", "https://www.timemark.com/solutions/proof-of-delivery-photo")

story.append(Paragraph("5. Hardware Integration", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.12 * inch))

story.append(Paragraph("Bluetooth Scale Integration", sub_heading))
story.append(Paragraph(
    f"BLE scales use the GATT protocol — the scale acts as a GATT Server, and the app connects as a Client.{fn(s_wsi)} "
    f"The standard Weight Scale Service (UUID 0x181D) transmits weight as uint16 × 0.005 kg with 5g resolution.{fn(s_bluetooth)} "
    "The driver app scans for BLE devices, connects to the scale, subscribes to weight notifications, and "
    "auto-records the reading with the order.", body_style))

story.append(Paragraph("Web Bluetooth API — Critical Limitation", subsub_heading))
story.append(Paragraph(
    f"The Web Bluetooth API allows browsers to connect to BLE devices — but <b>Safari on iOS is not supported</b>.{fn(s_webbluetooth)} "
    "This means a web-only app cannot do Bluetooth weigh-ins on iPhones. Overall browser compatibility: 58/100.", body_style))

story.append(make_table(
    ["Browser", "Web Bluetooth Support"],
    [
        ["Chrome (desktop + Android)", "Full support (v56+)"],
        ["Microsoft Edge", "Full support (v79+)"],
        ["Opera", "Full support"],
        ["Firefox", "Not supported"],
        ["Safari (iOS + macOS)", "Not supported (privacy policy)"],
    ],
    col_widths=[200, 268],
    highlight_first_col=True
))

story.append(Spacer(1, 0.06 * inch))
story.append(make_callout(
    "<b>Recommendation:</b> Use Web Bluetooth for driver-facing dashboards on Chrome/Android. For iOS, "
    "native BLE via Capacitor plugin (@capacitor-community/bluetooth-le) is required. "
    "This is a key reason Capacitor.js wrapping is needed — not just for App Store, but for hardware access."
))

story.append(Paragraph("Camera Features", sub_heading))
story.append(Paragraph(
    f"70% of Americans now prefer contactless delivery verification (photo) over signatures.{fn(s_timemark)} "
    f"Modern delivery apps treat photo capture as a mandatory workflow step.{fn(s_trackpod)}", body_style))
story.append(bullet("<b>Proof of pickup:</b> GPS+timestamp tagged photo of bag at customer door"))
story.append(bullet("<b>Proof of delivery:</b> Geofenced photo (must be within 50m of address)"))
story.append(bullet("<b>Before/after:</b> Photo of items at intake vs. clean folded items"))
story.append(bullet("<b>Damage documentation:</b> Close-up photos with annotations, linked to garment ID"))
story.append(bullet("<b>Driver UX:</b> Maximum 3 taps from order screen to captured photo"))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# SECTION 6: SCALABILITY & PERFORMANCE
# ═══════════════════════════════════════════════════════════════════════

s_ably2 = s_ably  # already cited
s_ws_scale = cite("DEV: Scaling WebSocket Connections", "https://dev.to/young_gao/scaling-websocket-connections-from-single-server-to-distributed-architecture-1men")
s_pg_redis = cite("Tim Derzhavets: PostgreSQL + Redis Design", "https://timderzhavets.com/blog/postgresql-and-redis-a-systems-design-approach-to/")
s_dotcom = cite("Dotcom-Monitor: API Response Times", "https://www.dotcom-monitor.com/blog/api-response-time-monitoring/")
s_pwa_cache = cite("AppInstitute: PWA Caching Strategies", "https://appinstitute.com/checklist-for-optimizing-pwa-caching-strategies/")

story.append(Paragraph("6. Scalability &amp; Performance", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.12 * inch))

story.append(Paragraph("Architecture Tiers", sub_heading))
story.append(make_table(
    ["Tier", "Users", "Architecture", "Monthly Cost"],
    [
        ["MVP (0–5K)", "Single server", "Node.js + Socket.io + PostgreSQL + PG LISTEN/NOTIFY", "~$20–50"],
        ["Growth (5K–100K)", "3–10 node cluster", "Socket.io + Redis adapter + sticky sessions + CDN", "~$200–500"],
        ["Scale (100K+)", "Dedicated WS tier", "Kafka backbone + Redis Cluster + K8s autoscaling", "$500–2,000+"],
    ],
    col_widths=[90, 90, 208, 80],
    highlight_first_col=True
))

story.append(Spacer(1, 0.06 * inch))
story.append(Paragraph(
    f"A single Node.js process handles 50K–100K concurrent WebSocket connections. With kernel tuning, "
    f"up to 240K connections at sub-50ms latency. Memory per connection: 20–50 KB.{fn(s_ably2)}", body_style))

story.append(Paragraph("Database Strategy: PostgreSQL + Redis Hybrid", sub_heading))
story.append(Paragraph(
    f"This is the validated pattern at DoorDash and across logistics platforms.{fn(s_pg_redis)}", body_style))

story.append(make_table(
    ["Data Type", "Storage", "Rationale"],
    [
        ["Orders, users, messages", "PostgreSQL", "Source of truth, ACID, complex queries"],
        ["Latest driver location", "Redis (TTL: 60s)", "Sub-ms reads; ~500x faster than disk"],
        ["Active WS sessions", "Redis (TTL: 90s)", "Presence tracking across servers"],
        ["ETA calculations", "Redis (TTL: 90s)", "Cache; recalculate on movement"],
        ["Driver availability", "Redis Geo", "O(log N) radius queries"],
        ["Rate limiting", "Redis", "Atomic increments, per-second TTL"],
        ["Historical location", "PostgreSQL", "Disputes, analytics, cold storage"],
    ],
    col_widths=[130, 110, 228],
    highlight_first_col=True
))

story.append(Spacer(1, 0.06 * inch))
story.append(Paragraph("Performance Targets", sub_heading))
story.append(make_table(
    ["Endpoint", "P50 Target", "P95 Target", "P99 Target"],
    [
        ["Order placement", "< 200ms", "< 500ms", "< 1s"],
        ["Status update (write)", "< 100ms", "< 300ms", "< 500ms"],
        ["Location update (write)", "< 50ms", "< 150ms", "< 300ms"],
        ["ETA fetch (cached)", "< 20ms", "< 50ms", "< 100ms"],
        ["Chat message send", "< 100ms", "< 300ms", "< 500ms"],
        ["WebSocket event delivery", "< 50ms", "< 100ms", "< 200ms"],
    ],
    col_widths=[140, 100, 100, 128],
    highlight_first_col=True
))
story.append(Paragraph(f"Source: Industry standards for logistics applications.{fn(s_dotcom)}", footnote_style))

story.append(Spacer(1, 0.06 * inch))
story.append(Paragraph("Code Splitting &amp; Caching", subsub_heading))
story.append(Paragraph(
    f"Route-based code splitting reduces initial load. App shell &lt;50KB gzipped; per-route chunks &lt;100KB. "
    f"Map component (Mapbox GL JS ~400KB gzipped) loads only on tracking pages. "
    f"Service worker caching: cache-first for static assets, network-first for active order status, "
    f"stale-while-revalidate for order history.{fn(s_pwa_cache)}", body_style))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# SECTION 7: APP STORE DEPLOYMENT
# ═══════════════════════════════════════════════════════════════════════

s_capacitor = cite("Capacitor.js Official Docs", "https://capacitorjs.com")
s_pkgpulse2 = cite("PkgPulse: RN vs Expo vs Capacitor 2026", "https://www.pkgpulse.com/blog/react-native-vs-expo-vs-capacitor-cross-platform-mobile-2026")
s_poplin_play = cite("Poplin on Google Play", "https://play.google.com/store/apps/details?id=com.sudshare.sudshare")
s_apple_guidelines = cite("Apple App Store Guidelines §3.1.3(e)", "https://developer.apple.com/app-store/review/guidelines/")
s_nextnative = cite("NextNative: Capacitor vs React Native", "https://nextnative.dev/blog/capacitor-vs-react-native")

story.append(Paragraph("7. App Store Deployment", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.12 * inch))

story.append(make_callout(
    "<b>Clear recommendation: Capacitor.js first → Expo/React Native at Series A.</b> "
    "Your web app is already built. Capacitor wraps it in days, not months. All critical native features "
    "(background GPS, push, camera, BLE) are available via plugins."
))
story.append(Spacer(1, 0.1 * inch))

story.append(Paragraph("Head-to-Head Comparison", sub_heading))
story.append(make_table(
    ["Criteria", "PWA", "Capacitor", "Expo (RN)", "Flutter"],
    [
        ["Rewrite needed?", "No", "No", "Partial", "Full"],
        ["Time to submission", "1–2 wk", "1–4 wk", "4–10 wk", "10–18 wk"],
        ["Background GPS", "No (iOS)", "Yes (plugin)", "Yes", "Yes (paid)"],
        ["Push notifications", "Limited iOS", "Yes", "Yes", "Yes"],
        ["Camera", "Basic", "Yes", "Yes", "Yes"],
        ["Bluetooth", "No", "Yes", "Yes", "Yes"],
        ["Native scroll perf", "WebView", "WebView", "Native", "Native"],
        ["OTA updates", "Always", "Yes (Appflow)", "Yes (EAS)", "Limited"],
        ["App Store risk", "High", "Low", "Low", "Low"],
        ["Team skill req.", "Web", "Web", "React", "Dart"],
    ],
    col_widths=[110, 68, 80, 80, 80],
    highlight_first_col=True
))

story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("Apple's 30% Cut Does NOT Apply", sub_heading))
story.append(Paragraph(
    f"Apple's App Store Review Guidelines, Section 3.1.3(e) states: \"If your app enables people to purchase "
    f"physical goods or services that will be consumed outside of the app, you must use purchase methods other "
    f"than in-app purchase.\"{fn(s_apple_guidelines)}", body_style))
story.append(Paragraph(
    "Laundry is a physical service. You are exempt from IAP. Use Stripe + Apple Pay + Google Pay directly. "
    "This is the same exemption used by Uber, DoorDash, Amazon, and Airbnb. "
    "<b>Apple gets $0 from every laundry order.</b>", body_style))

story.append(Paragraph("What Gets You Rejected", sub_heading))
story.append(bullet("Incomplete app: crashes, placeholder text, non-functional URLs"))
story.append(bullet("Missing demo credentials in Review Notes for reviewer access"))
story.append(bullet("\"Repackaged website\" with no added value (must have native features)"))
story.append(bullet("Undisclosed data collection or unjustified permissions"))
story.append(bullet("Metadata mismatch (screenshots don't match actual UI)"))
story.append(bullet("Background location without clear justification in Review Notes"))

story.append(Paragraph("Cost Breakdown", sub_heading))
story.append(make_table(
    ["Item", "Cost", "Frequency"],
    [
        ["Apple Developer Program", "$99", "Annual"],
        ["Google Play Developer", "$25", "One-time"],
        ["Capacitor.js", "Free", "Open source"],
        ["Ionic Appflow (cloud builds)", "$0–499/mo", "Optional"],
        ["Mac for iOS builds", "$0 (use EAS/CI)", "—"],
    ],
    col_widths=[200, 120, 148],
    highlight_first_col=True
))

story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("Real-World Validation", sub_heading))
story.append(Paragraph(
    f"A user review of Poplin on Google Play literally notes: <i>\"It's not really an app. It essentially opens up "
    f"a web page (their website) on a separate browser.\"</i>{fn(s_poplin_play)} This is a WebView-based app in production "
    "with <b>100K+ downloads and a 4.0 rating</b>. The threshold for acceptable is lower than you think.", body_style))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# SECTION 8: INTEGRATIONS & COSTS
# ═══════════════════════════════════════════════════════════════════════

s_mapbox2 = cite("Yalantis: Mapbox for Mobile", "https://yalantis.com/blog/mapbox-maps-ready-mobile-apps/")
s_stripe = cite("Stripe Connect Split Payments", "https://stripe.com/resources/more/how-to-implement-split-payment-systems-what-businesses-need-to-do-to-make-it-work")
s_aloa = cite("Aloa: Mapbox vs Google Maps Pricing", "https://aloa.co/blog/mapbox-vs-google-maps-what-you-need-to-know-before-you-choose")

story.append(Paragraph("8. Integrations &amp; Costs", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.12 * inch))

story.append(Paragraph("MVP Integration Stack", sub_heading))
story.append(make_table(
    ["Category", "Tool", "Monthly Cost (MVP)", "Notes"],
    [
        ["Maps", "Mapbox", "$0 (free tier)", "50K web / 25K mobile MAUs free"],
        ["Push Notifications", "OneSignal", "$0 (free tier)", "Unlimited mobile push"],
        ["SMS", "Twilio", "~$79–237", "Based on order volume; $0.0079/msg"],
        ["Email", "SendGrid", "$0–20", "100/day free; transactional only"],
        ["Analytics", "Firebase Analytics", "$0", "Add Mixpanel post-launch"],
        ["Payments", "Stripe Connect", "2.9% + $0.30/charge", "No fixed monthly; + 0.25% per payout"],
        ["Support", "Freshdesk", "$0 (2 agents free)", "Scale to paid at volume"],
        ["Hosting", "Railway / Render", "$20–50", "Single server for MVP"],
    ],
    col_widths=[85, 95, 110, 178],
    highlight_first_col=True
))

story.append(Spacer(1, 0.1 * inch))
story.append(Paragraph("Stripe Connect: 3-Way Payment Splits", sub_heading))
story.append(Paragraph(
    f"Stripe Connect is the industry standard for marketplace payments.{fn(s_stripe)} For a 3-way split "
    "(platform + laundromat + driver), use Separate Charges and Transfers:", body_style))
story.append(bullet("Customer pays $43.00 → Platform receives full amount"))
story.append(bullet("Platform auto-transfers $32.25 to laundromat (Express account)"))
story.append(bullet("Platform auto-transfers $6.00 to driver (Express account)"))
story.append(bullet("Platform retains $4.75 after Stripe fees"))
story.append(bullet("Instant Payouts available for drivers (debit card, +1.5% fee)"))

story.append(Paragraph("Mapbox over Google Maps", sub_heading))
story.append(Paragraph(
    f"Mapbox is ~60% cheaper than Google Maps at scale. At 70K map loads/month: Google ~$504/mo vs. "
    f"Mapbox ~$100/mo.{fn(s_aloa)} Directions API is 2.5x cheaper ($2/1K vs $5/1K).{fn(s_mapbox2)} "
    "Free tier covers 50K web loads and 100K direction API requests monthly.", body_style))

story.append(Paragraph("Total Estimated Monthly Infrastructure", sub_heading))
story.append(make_table(
    ["Stage", "Orders/Month", "Est. Infrastructure", "Notes"],
    [
        ["MVP Launch", "0–500", "$100–300/mo", "Plus Stripe % fees"],
        ["Early Growth", "500–5,000", "$300–700/mo", "Add Redis, CDN"],
        ["Growth", "5,000–50,000", "$700–2,000/mo", "Multi-server, Kafka"],
        ["Scale", "50,000+", "$2,000–5,000+/mo", "Dedicated tiers, K8s"],
    ],
    col_widths=[90, 90, 130, 158],
    highlight_first_col=True
))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# SECTION 9: BUILD PHASES
# ═══════════════════════════════════════════════════════════════════════

story.append(Paragraph("9. Build Phases — The Honest Timeline", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.12 * inch))

story.append(Paragraph(
    "This is a realistic 16-week plan from where we are now to App Store submission. Each phase "
    "builds on the previous one. Weeks are working weeks (5 days).", body_style))

# Phase 1
story.append(Spacer(1, 0.08 * inch))
story.append(Paragraph("Phase 1: \"Make It Real\" — Weeks 1–4", phase_label))
story.append(Paragraph("Core infrastructure: messaging, order lifecycle, pricing, photos, notifications", phase_subtitle))

phase1_items = [
    ["WebSocket messaging (all roles)", "Socket.io rooms per order + role-based access", "Week 1–2"],
    ["Complete order state machine", "16-state FSM with transitions, guards, audit log", "Week 1–2"],
    ["Weight-based pricing engine", "Per-lb pricing + customization add-ons + minimums", "Week 2"],
    ["Photo capture (proof of pickup/delivery)", "Camera API + GPS/timestamp tagging + cloud storage", "Week 3"],
    ["Push notification system", "FCM/OneSignal for all status transitions", "Week 3–4"],
    ["Driver assignment flow", "Accept/reject mechanics + availability management", "Week 4"],
]

story.append(make_table(
    ["Feature", "Technical Scope", "Timeline"],
    phase1_items,
    col_widths=[155, 228, 85],
    highlight_first_col=True
))

# Phase 2
story.append(Spacer(1, 0.12 * inch))
story.append(Paragraph("Phase 2: \"Make It Smart\" — Weeks 5–8", phase_label))
story.append(Paragraph("AI capabilities, real-time tracking, geofencing", phase_subtitle))

phase2_items = [
    ["AI voice ordering", "OpenAI Realtime API + function calling + confirmation flow", "Week 5–6"],
    ["Image recognition", "GPT-4o Vision for garment ID at intake", "Week 6"],
    ["AI chatbot", "Conversational ordering with context + saved preferences", "Week 6–7"],
    ["Real-time GPS tracking", "Mapbox GL JS + dual-path (Redis pub/sub + event log)", "Week 7–8"],
    ["Geofencing", "Redis Geo + auto-status transitions (100m/200m)", "Week 8"],
    ["ETA calculation", "Mapbox Directions API + Redis cache + WebSocket broadcast", "Week 8"],
]

story.append(make_table(
    ["Feature", "Technical Scope", "Timeline"],
    phase2_items,
    col_widths=[155, 228, 85],
    highlight_first_col=True
))

# Phase 3
story.append(Spacer(1, 0.12 * inch))
story.append(Paragraph("Phase 3: \"Make It Native\" — Weeks 9–12", phase_label))
story.append(Paragraph("App Store deployment, hardware integration, payments", phase_subtitle))

phase3_items = [
    ["Capacitor.js wrapping", "iOS + Android native shells from existing web app", "Week 9"],
    ["Bluetooth scale integration", "Native BLE via @capacitor-community/bluetooth-le", "Week 10"],
    ["Background GPS (drivers)", "@capacitor-community/background-geolocation", "Week 10"],
    ["App Store submission", "Apple review prep + Google Play listing", "Week 11–12"],
    ["Stripe Connect payments", "3-way splits + Express accounts + Apple Pay + Google Pay", "Week 11"],
    ["Siri + Google Assistant", "App Intents (iOS) + App Actions (Android)", "Week 12"],
]

story.append(make_table(
    ["Feature", "Technical Scope", "Timeline"],
    phase3_items,
    col_widths=[155, 228, 85],
    highlight_first_col=True
))

# Phase 4
story.append(Spacer(1, 0.12 * inch))
story.append(Paragraph("Phase 4: \"Make It Scale\" — Weeks 13–16", phase_label))
story.append(Paragraph("Performance optimization, monitoring, hardening", phase_subtitle))

phase4_items = [
    ["Redis for hot data", "Driver locations, sessions, ETA cache, rate limiting", "Week 13"],
    ["Socket.io Redis adapter", "Multi-server WebSocket scaling with sticky sessions", "Week 13–14"],
    ["Code splitting + perf", "Route-based splitting, lazy load maps/chat, image optimization", "Week 14"],
    ["Analytics pipeline", "Firebase Analytics + key event tracking + funnel setup", "Week 15"],
    ["Load testing + hardening", "Stress test WebSocket connections, API endpoints, database", "Week 15–16"],
    ["Monitoring", "Prometheus + Grafana for connection counts, latency, errors", "Week 16"],
]

story.append(make_table(
    ["Feature", "Technical Scope", "Timeline"],
    phase4_items,
    col_widths=[155, 228, 85],
    highlight_first_col=True
))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# SECTION 10: WHAT WE CAN VS CAN'T BUILD
# ═══════════════════════════════════════════════════════════════════════

story.append(Paragraph("10. What We Can vs. Can't Build In This Tool", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.12 * inch))

story.append(Paragraph(
    "An honest assessment of what Computer can build directly versus what requires external setup, "
    "accounts, or services that only you (the founder) can provision.", body_style))

story.append(Spacer(1, 0.08 * inch))
story.append(Paragraph("What Computer Can Build", sub_heading))

can_build = [
    ["Complete web application", "React frontend, Node.js/Express backend, PostgreSQL schema"],
    ["WebSocket messaging system", "Socket.io server + client, rooms, reconnection, read receipts"],
    ["Order state machine", "Full 16-state FSM with transitions, guards, notifications, audit log"],
    ["Pricing engine", "Weight-based pricing, customization add-ons, minimum orders, rush multipliers"],
    ["AI voice ordering integration", "OpenAI Realtime API integration, function calling, conversation flow"],
    ["AI chatbot", "GPT-4o system prompt, function definitions, conversation memory"],
    ["GPS tracking UI", "Mapbox integration, driver location broadcasting, ETA display"],
    ["Photo capture workflows", "Camera API integration, GPS tagging, upload pipeline"],
    ["Capacitor.js wrapping", "Native shell configuration, plugin setup, build config"],
    ["Stripe Connect integration", "Payment flows, split logic, webhook handlers"],
    ["Push notification system", "FCM/OneSignal SDK integration, notification triggers"],
    ["Admin dashboard", "Order management, driver management, analytics views"],
]

story.append(make_table(
    ["Component", "Scope"],
    can_build,
    col_widths=[175, 293],
    highlight_first_col=True
))

story.append(Spacer(1, 0.12 * inch))
story.append(Paragraph("What Requires External Setup (By You)", sub_heading))

cant_build = [
    ["Apple Developer account", "$99/yr — requires personal Apple ID + payment", "You"],
    ["Google Play Developer", "$25 one-time — requires Google account", "You"],
    ["Stripe account + Connect", "Business verification, bank account linking, KYC", "You"],
    ["Mapbox API keys", "Free account signup at mapbox.com", "You"],
    ["OpenAI API key", "Account + billing setup at platform.openai.com", "You"],
    ["Domain name", "Purchase via Namecheap/Cloudflare (~$12/yr)", "You"],
    ["Hosting / deployment", "Railway, Render, or Fly.io account + payment", "You"],
    ["SSL certificate", "Free via Let's Encrypt (auto with most hosts)", "Auto"],
    ["Firebase project", "Free Google Cloud project for FCM + analytics", "You"],
    ["Twilio account", "SMS account + phone number ($1/mo + per-msg)", "You"],
    ["App Store submission", "Xcode archive + upload (requires Mac or CI)", "You/CI"],
    ["App Store review", "1–3 day Apple review process", "Apple"],
]

story.append(make_table(
    ["Item", "Details", "Owner"],
    cant_build,
    col_widths=[135, 265, 68],
    highlight_first_col=True
))

story.append(Spacer(1, 0.12 * inch))
story.append(make_callout(
    "<b>Bottom line:</b> Computer builds the software — the web app, the backend, the logic, the integrations, "
    "the UI, the API connections. What it can't do is create accounts on third-party services, submit apps to "
    "the App Store, or set up payment processing — those require your identity, payment method, and legal entity."
))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════════════
# APPENDIX: SOURCES
# ═══════════════════════════════════════════════════════════════════════

story.append(Paragraph("Appendix: Sources", section_heading))
story.append(TealLine())
story.append(Spacer(1, 0.15 * inch))

story.append(Paragraph(
    "All sources cited in this document, with full URLs:", body_style))
story.append(Spacer(1, 0.08 * inch))

# Sort by number
sorted_sources = sorted(SOURCES.values(), key=lambda x: x[0])
for num, label, url in sorted_sources:
    story.append(Paragraph(
        f'{num}. {label} — <a href="{url}" color="#01696F">{url}</a>',
        ParagraphStyle("SourceItem", fontName="Inter", fontSize=8, leading=12,
                       textColor=TEXT_BODY, spaceAfter=3, leftIndent=20, firstLineIndent=-20)
    ))

# ═══════════════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════════════

doc.build(story, onFirstPage=cover_footer, onLaterPages=header_footer)
print(f"PDF generated: {OUTPUT}")
print(f"Total sources cited: {len(SOURCES)}")
