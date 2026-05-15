const en = {
  // Home dashboard
  "home.welcome": "Welcome back",
  "home.schedule_pickup": "Schedule a Pickup",
  "home.track_orders": "Track Orders",
  "home.wash_preferences": "Wash Preferences",
  "home.no_active_orders": "No active orders",

  // Wash wizard
  "wizard.standard_wash": "Standard Wash",
  "wizard.signature_wash": "Signature Wash",
  "wizard.choose_bag_size": "Choose Your Bag Size",
  "wizard.flat_rate": "Flat-rate pricing — know your price before you order.",
  "wizard.bags_selected": "bag(s) selected",
  "wizard.total_capacity": "Up to {weight} lbs total capacity",
  "wizard.continue": "Continue",
  "wizard.back": "Back",
  "wizard.place_order": "Place Order",
  "wizard.placing_order": "Placing Order...",
  "wizard.estimated_total": "Estimated total",
  "wizard.select_pickup_time": "Select a pickup time to continue",
  "wizard.coverage_notice": "We'll confirm coverage after you place the order. If we can't serve your address, we'll fully refund within 1 business day.",

  // Orders
  "orders.title": "My Orders",
  "orders.subtitle": "Track and manage your laundry",
  "orders.no_orders": "No orders yet",
  "orders.no_orders_desc": "Schedule your first pickup and we'll take care of the rest.",
  "orders.schedule_first": "Schedule a Pickup",
  "orders.filter_all": "All",
  "orders.filter_active": "Active",
  "orders.filter_done": "Done",
  "orders.filter_cancelled": "Cancelled",
  "orders.message": "Message",
  "orders.cancel": "Cancel",

  // Order detail
  "order_detail.title": "Order Details",
  "order_detail.order_summary": "Order Summary",
  "order_detail.order_status": "Order Status",
  "order_detail.order_progress": "Order Progress",
  "order_detail.cancel_order": "Cancel Order",
  "order_detail.file_dispute": "File a Dispute",
  "order_detail.need_help": "Need Help?",
  "order_detail.contact_support": "Contact Support",
  "order_detail.leave_review": "Leave a Review",
  "order_detail.how_was_experience": "How was your experience?",

  // Profile
  "profile.title": "Profile",
  "profile.subtitle": "Your account & preferences",
  "profile.personal_info": "Personal Information",
  "profile.saved_addresses": "Saved Addresses",
  "profile.payment_methods": "Payment Methods",
  "profile.notifications": "Notifications",
  "profile.wash_preferences": "Wash Preferences",
  "profile.help_center": "Help Center",
  "profile.sign_out": "Sign Out",
  "profile.account_settings": "Account Settings",
  "profile.preferences": "Preferences",
  "profile.security": "Security",
  "profile.language": "Language",

  // Notifications
  "notifications.title": "Notifications",
  "notifications.empty": "No notifications",
  "notifications.mark_all_read": "Mark all as read",

  // Common
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.loading": "Loading...",
  "common.error": "Error",
  "common.success": "Success",
  "common.english": "English",
  "common.spanish": "Español",
} as const;

export default en;
export type TranslationKey = keyof typeof en;
