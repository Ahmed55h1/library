export interface Category {
  id: number;
  name_ar: string;
  name_en: string;
  image_url: string;
  visible: number;
  sort_order: number;
}
export interface Product {
  id: number;
  category_id: number;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  price: number;
  stock: number;
  image_url: string;
  visible: number;
  sort_order: number;
  subject: string;
  academic_level: string;
  teacher_name: string;
  created_at: string;
}
export interface Settings {
  name_ar: string;
  name_en: string;
  logo_url: string;
  phone: string;
  email: string;
  address_ar: string;
  address_en: string;
  currency: string;
  default_language: string;
  low_stock_threshold: number;
}
export interface DeliveryRate {
  governorate: string;
  fee: number;
  enabled: number;
}
export interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  phone: string;
  governorate: string;
  area: string;
  address: string;
  notes: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  currency: string;
  status: string;
  payment_status: string;
  payment_method: string;
  created_at: string;
}
export interface OrderItem {
  product_id: number;
  name_ar: string;
  name_en: string;
  price: number;
  quantity: number;
}
export interface StoreData {
  settings: Settings;
  categories: Category[];
  products: Product[];
  deliveryRates: DeliveryRate[];
}
export interface CartItem {
  product_id: number;
  quantity: number;
}
