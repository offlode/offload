import type { TranslationKey } from "./en";

const es: Record<TranslationKey, string> = {
  // Home dashboard
  "home.welcome": "Bienvenido de nuevo",
  "home.schedule_pickup": "Programar recogida",
  "home.track_orders": "Seguir pedidos",
  "home.wash_preferences": "Preferencias de lavado",
  "home.no_active_orders": "Sin pedidos activos",

  // Wash wizard
  "wizard.standard_wash": "Lavado Estándar",
  "wizard.signature_wash": "Lavado Signature",
  "wizard.choose_bag_size": "Elige el tamaño de bolsa",
  "wizard.flat_rate": "Precio fijo — conoce tu precio antes de ordenar.",
  "wizard.bags_selected": "bolsa(s) seleccionada(s)",
  "wizard.total_capacity": "Hasta {weight} lbs de capacidad total",
  "wizard.continue": "Continuar",
  "wizard.back": "Atrás",
  "wizard.place_order": "Realizar pedido",
  "wizard.placing_order": "Realizando pedido...",
  "wizard.estimated_total": "Total estimado",
  "wizard.select_pickup_time": "Selecciona una hora de recogida para continuar",
  "wizard.coverage_notice": "Confirmaremos la cobertura después de realizar el pedido. Si no podemos atender su dirección, le reembolsaremos completamente en 1 día hábil.",

  // Orders
  "orders.title": "Mis Pedidos",
  "orders.subtitle": "Rastrea y administra tu lavandería",
  "orders.no_orders": "Sin pedidos aún",
  "orders.no_orders_desc": "Programa tu primera recogida y nosotros nos encargamos del resto.",
  "orders.schedule_first": "Programar recogida",
  "orders.filter_all": "Todos",
  "orders.filter_active": "Activos",
  "orders.filter_done": "Completados",
  "orders.filter_cancelled": "Cancelados",
  "orders.message": "Mensaje",
  "orders.cancel": "Cancelar",

  // Order detail
  "order_detail.title": "Detalles del Pedido",
  "order_detail.order_summary": "Resumen del Pedido",
  "order_detail.order_status": "Estado del Pedido",
  "order_detail.order_progress": "Progreso del Pedido",
  "order_detail.cancel_order": "Cancelar Pedido",
  "order_detail.file_dispute": "Presentar Disputa",
  "order_detail.need_help": "¿Necesitas ayuda?",
  "order_detail.contact_support": "Contactar Soporte",
  "order_detail.leave_review": "Dejar una Reseña",
  "order_detail.how_was_experience": "¿Cómo fue tu experiencia?",

  // Profile
  "profile.title": "Perfil",
  "profile.subtitle": "Tu cuenta y preferencias",
  "profile.personal_info": "Información Personal",
  "profile.saved_addresses": "Direcciones Guardadas",
  "profile.payment_methods": "Métodos de Pago",
  "profile.notifications": "Notificaciones",
  "profile.wash_preferences": "Preferencias de Lavado",
  "profile.help_center": "Centro de Ayuda",
  "profile.sign_out": "Cerrar Sesión",
  "profile.account_settings": "Configuración de Cuenta",
  "profile.preferences": "Preferencias",
  "profile.security": "Seguridad",
  "profile.language": "Idioma",

  // Notifications
  "notifications.title": "Notificaciones",
  "notifications.empty": "Sin notificaciones",
  "notifications.mark_all_read": "Marcar todo como leído",

  // Common
  "common.save": "Guardar",
  "common.cancel": "Cancelar",
  "common.delete": "Eliminar",
  "common.edit": "Editar",
  "common.loading": "Cargando...",
  "common.error": "Error",
  "common.success": "Éxito",
  "common.english": "English",
  "common.spanish": "Español",
};

export default es;
