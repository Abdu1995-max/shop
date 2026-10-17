import React, { useEffect, useState, FormEvent, useMemo, MouseEvent, useRef } from 'react';
import { Send, Package, Plus, Settings, Trash2, ArrowLeft, LogOut, Search, X, X as CloseIcon, MapPin, Box, Filter, ChevronRight, Globe, ShieldCheck, Star, TrendingUp, BarChart3, ChevronDown, ShoppingCart, Minus, Phone, Sparkles, MessageSquare, Bot, ArrowUpDown, SlidersHorizontal, User as UserIcon, Mail, Lock, UserPlus, LogIn, History, CreditCard, AlertCircle, Loader2, ChevronUp, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import Markdown from 'react-markdown';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Cell, PieChart, Pie, Legend 
} from 'recharts';
import { auth, db } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  orderBy,
  getDocs,
  updateDoc
} from 'firebase/firestore';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'user' | 'admin';
  createdAt: string;
}

interface Order {
  id?: string;
  orderId: string;
  userId: string;
  productId: number;
  productName: string;
  quantity: number;
  totalPrice: number;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: any;
}

interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  description: string;
  shopName?: string;
  category?: string;
  moq?: string;
  location?: string;
  isFeatured?: boolean;
  technical_specs?: string;
  specifications?: { key: string; value: string }[];
  reviews?: { user: string; rating: number; comment: string; date: string }[];
  images?: string[];
}

interface CartItem extends Product {
  quantity: number;
}

interface AdminSession {
  uid: string;
  email: string;
  sessionId: string;
  lastActive: string;
}

const SmartImage = ({ src, alt, className, size = "400/400", lowData = false, style, loading = "lazy" }: { src: string; alt: string; className?: string; size?: string; lowData?: boolean; style?: React.CSSProperties; loading?: "lazy" | "eager" }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Reset states when src changes to allow new image to load/preview correctly
  useEffect(() => {
    setIsLoaded(false);
    setError(false);
  }, [src]);

  // Optimize URLs using server-side optimizer
  const optimizedSrc = useMemo(() => {
    if (!src) return `https://picsum.photos/seed/placeholder/${size}${lowData ? '?grayscale' : ''}`;
    
    // Don't optimize data URLs or already optimized URLs
    if (src.startsWith('data:') || src.includes('/api/optimize-image')) return src;

    let finalSrc = src;
    // Handle legacy Picsum logic if it's missing dimensions
    if (src.includes('picsum.photos') && !src.match(/\/\d+\/\d+/)) {
      finalSrc = `${src.replace(/\/$/, '')}/${size}`;
    }

    // Use our server-side optimizer for all external images
    // This ensures they are max 800px wide and 80% quality as requested
    return `/api/optimize-image?url=${encodeURIComponent(finalSrc)}`;
  }, [src, size, lowData]);

  return (
    <div className={`relative overflow-hidden bg-zinc-100 ${className}`}>
      <AnimatePresence>
        {!isLoaded && !error && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="w-6 h-6 border-2 border-[#FF6600]/20 border-t-[#FF6600] rounded-full animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>
      
      <img
        key={optimizedSrc}
        src={error ? `https://picsum.photos/seed/error/${size}` : optimizedSrc}
        alt={alt}
        loading={loading}
        referrerPolicy="no-referrer"
        onLoad={() => setIsLoaded(true)}
        onError={() => setError(true)}
        className={`w-full h-full object-cover transition-all duration-500 ${isLoaded ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-110 blur-xl'} ${className || ''}`}
        style={style}
      />
    </div>
  );
};

const TELEGRAM_USERNAME = "abd0642";
const SUPPORT_PHONE = "0919644623";
const ITEMS_PER_PAGE = 12;

const CATEGORIES = [
  "All Categories",
  "Electronics",
  "Apparel",
  "Home & Garden",
  "Beauty",
  "Sports",
  "Industrial",
  "Food & Beverage"
];

const COMMON_SPEC_KEYS = [
  "Material", "Weight", "Dimensions", "Warranty", "Origin", "Color", "Size", 
  "Power", "Voltage", "Battery", "Connectivity", "Storage", "Display", 
  "Processor", "RAM", "Camera", "Model", "Brand", "Condition"
];

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = parsed.error;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-2xl font-black text-zinc-900 mb-2">Application Error</h1>
            <p className="text-zinc-500 mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-[#FF6600] text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-100"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'shop' | 'admin' | 'detail' | 'profile' | 'orders'>('shop');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  
  // Auth State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', displayName: '' });
  const [adminAuthForm, setAdminAuthForm] = useState({ email: '', password: '', displayName: '' });
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authSuccess, setAuthSuccess] = useState('');
  const [isAdminLoginModalOpen, setIsAdminLoginModalOpen] = useState(false);
  const [adminAuthMode, setAdminAuthMode] = useState<'login' | 'register'>('login');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [isForgotPasswordLoading, setIsForgotPasswordLoading] = useState(false);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState('');
  const [adminSessionError, setAdminSessionError] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(localStorage.getItem('admin_session_id'));
  
  // Orders State
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isOrdering, setIsOrdering] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [adminSubView, setAdminSubView] = useState<'dashboard' | 'products' | 'orders' | 'users'>('dashboard');
  const [adminProductSearch, setAdminProductSearch] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [isZoomed, setIsZoomed] = useState(false);
  const [isSpecsExpanded, setIsSpecsExpanded] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [productToDelete, setProductToDelete] = useState<number | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [lowDataMode, setLowDataMode] = useState(false);
  const [buyerInfo, setBuyerInfo] = useState({
    name: '',
    phone: '',
    location: ''
  });
  const [showBuyerForm, setShowBuyerForm] = useState(false);
  const [showTelegramConfirmation, setShowTelegramConfirmation] = useState(false);
  const [telegramAction, setTelegramAction] = useState<{ type: 'checkout' | 'contact', product?: Product } | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: 'checkout' | 'contact', product?: Product } | null>(null);
  const [backendStats, setBackendStats] = useState<{
    totalOrders: number;
    avgOrderValue: number;
    topCategories: { category: string; total_sold: number }[];
    totalRevenue: number;
    totalProducts: number;
    dailyOrders: { date: string; count: number }[];
  } | null>(null);
  
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState<'newest' | 'price-low' | 'price-high' | 'rating'>('newest');
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [reviewForm, setReviewForm] = useState({
    user: '',
    rating: 5,
    comment: ''
  });
  const [reviewSortBy, setReviewSortBy] = useState<'newest' | 'rating-high' | 'rating-low'>('newest');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '',
    price: 0,
    description: '',
    image: '',
    shopName: '',
    category: 'Electronics',
    moq: '1 piece',
    location: 'Sodo, Ethiopia',
    isFeatured: false,
    technical_specs: ''
  });

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch user profile
        let userDoc;
        try {
          userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
        }

        if (userDoc && userDoc.exists()) {
          setUserProfile(userDoc.data() as UserProfile);
        } else {
          // Create profile if it doesn't exist (e.g. first login)
          const newProfile: UserProfile = {
            uid: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || 'User',
            photoURL: currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName || 'User'}&background=random`,
            role: currentUser.email === 'abduaragaw1996@gmail.com' ? 'admin' : 'user',
            createdAt: new Date().toISOString()
          };
          try {
            await setDoc(doc(db, 'users', currentUser.uid), newProfile);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
          }
          setUserProfile(newProfile);
        }

        // Listen for orders
        const ordersQuery = query(
          collection(db, 'orders'), 
          where('userId', '==', currentUser.uid),
          orderBy('createdAt', 'desc')
        );
        const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
          if (!isAuthReady) return;
          const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
          setUserOrders(orders);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'orders');
        });

        return () => unsubscribeOrders();
      } else {
        setUserProfile(null);
        setUserOrders([]);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);

    try {
      if (authMode === 'register') {
        const userCredential = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        await updateProfile(userCredential.user, {
          displayName: authForm.displayName,
          photoURL: `https://ui-avatars.com/api/?name=${authForm.displayName}&background=random`
        });
        
        const newProfile: UserProfile = {
          uid: userCredential.user.uid,
          email: authForm.email,
          displayName: authForm.displayName,
          photoURL: `https://ui-avatars.com/api/?name=${authForm.displayName}&background=random`,
          role: authForm.email === 'abduaragaw1996@gmail.com' ? 'admin' : 'user',
          createdAt: new Date().toISOString()
        };
        try {
          await setDoc(doc(db, 'users', userCredential.user.uid), newProfile);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${userCredential.user.uid}`);
        }
        setUserProfile(newProfile);
      } else {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
      }
      setShowAuthModal(false);
      setAuthForm({ email: '', password: '', displayName: '' });
      setAuthError('');
      setAuthSuccess('');
    } catch (error: any) {
      console.error('Auth Error:', error);
      if (error.code === 'auth/operation-not-allowed') {
        setAuthError('Email/Password authentication is not enabled in the Firebase Console. Please enable it in the Authentication > Sign-in method tab.');
      } else if (error.code === 'auth/email-already-in-use') {
        setAuthError('This email is already registered. Please sign in instead.');
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setAuthError('Invalid email or password. Please try again.');
      } else if (error.code === 'auth/invalid-action-code') {
        setAuthError('The requested action is invalid. This usually means the link has expired or has already been used.');
      } else if (error.code === 'auth/unauthorized-domain') {
        setAuthError('This domain is not authorized for authentication. Please add it to the Authorized Domains in the Firebase Console.');
      } else {
        setAuthError(error.message || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (userProfile?.role === 'admin') {
        localStorage.removeItem('admin_session_id');
        setCurrentSessionId(null);
      }
      await signOut(auth);
      setView('shop');
    } catch (error) {
      console.error('Logout Error:', error);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError('');
    setIsAuthLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setShowAuthModal(false);
      setAuthError('');
      setAuthSuccess('');
    } catch (error: any) {
      console.error('Google Auth Error:', error);
      if (error.code === 'auth/unauthorized-domain') {
        setAuthError('This domain is not authorized for authentication. Please add it to the Authorized Domains in the Firebase Console.');
      } else if (error.code === 'auth/popup-blocked') {
        setAuthError('The popup was blocked by your browser. Please allow popups for this site.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        setAuthError('The login popup was closed before completion. Please try again.');
      } else {
        setAuthError(error.message || 'Failed to sign in with Google.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!authForm.email) {
      setAuthError('Please enter your email address first.');
      return;
    }
    setAuthError('');
    setAuthSuccess('');
    setIsAuthLoading(true);
    try {
      await sendPasswordResetEmail(auth, authForm.email);
      setAuthSuccess('Password reset email sent! Please check your inbox.');
    } catch (error: any) {
      console.error('Reset Error:', error);
      setAuthError(error.message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handlePlaceOrder = async (product: Product, quantity: number) => {
    if (!user) {
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }

    setIsOrdering(true);
    try {
      const orderData: Order = {
        orderId: `ORD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        userId: user.uid,
        productId: product.id,
        productName: product.name,
        quantity: quantity,
        totalPrice: product.price * quantity,
        status: 'pending',
        createdAt: serverTimestamp()
      };
      try {
        await addDoc(collection(db, 'orders'), orderData);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'orders');
      }
      alert('Order placed successfully! You can view it in your orders section.');
      setView('orders');
    } catch (error) {
      console.error('Order Error:', error);
      alert('Failed to place order. Please try again.');
    } finally {
      setIsOrdering(false);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    return fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Convert 0/1 to boolean for isFeatured
          const formattedData = data.map(p => ({
            ...p,
            isFeatured: !!p.isFeatured
          }));
          setProducts(formattedData);
          return formattedData;
        } else {
          setProducts([]);
          return [];
        }
      })
      .catch((err) => {
        console.error('Error fetching products:', err);
        setProducts([]);
        return [];
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    let unsubscribeOrders: () => void;
    let unsubscribeUsers: () => void;

    if (userProfile?.role === 'admin' && view === 'admin') {
      // Listen for all orders
      const ordersQuery = query(
        collection(db, 'orders'), 
        orderBy('createdAt', 'desc')
      );
      unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
        if (!isAuthReady) return;
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        setAllOrders(orders);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'orders');
      });

      // Listen for all users
      const usersQuery = query(
        collection(db, 'users'), 
        orderBy('createdAt', 'desc')
      );
      unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        if (!isAuthReady) return;
        const users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        setAllUsers(users);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users');
      });
    }

    return () => {
      if (unsubscribeOrders) unsubscribeOrders();
      if (unsubscribeUsers) unsubscribeUsers();
    };
  }, [userProfile, view]);

  // Admin Session Monitoring
  useEffect(() => {
    if (userProfile?.role === 'admin' && currentSessionId) {
      const sessionRef = doc(db, 'admin_sessions', 'current');
      
      // Update lastActive every minute
      const interval = setInterval(async () => {
        try {
          await updateDoc(sessionRef, { lastActive: new Date().toISOString() });
        } catch (err) {
          console.error('Error updating session activity:', err);
          try {
            handleFirestoreError(err, OperationType.UPDATE, 'admin_sessions/current');
          } catch (e) {
            // Error already logged
          }
        }
      }, 60000);

      // Listen for session changes
      const unsubscribe = onSnapshot(sessionRef, (snapshot) => {
        if (!isAuthReady) return;
        if (snapshot.exists()) {
          const data = snapshot.data() as AdminSession;
          if (data.sessionId !== currentSessionId) {
            // Another session has taken over
            setAdminSessionError('Another admin session has been started. You have been logged out.');
            handleLogout();
          }
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'admin_sessions/current');
      });

      return () => {
        clearInterval(interval);
        unsubscribe();
      };
    }
  }, [userProfile, currentSessionId]);

  const fetchBackendStats = () => {
    fetch('/api/admin/stats')
      .then(res => res.json())
      .then(data => setBackendStats(data))
      .catch(err => console.error('Error fetching stats:', err));
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (userProfile?.role === 'admin' && view === 'admin') {
      fetchBackendStats();
      // Poll every 10 seconds for real-time updates
      interval = setInterval(fetchBackendStats, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [userProfile, view, products]);

  useEffect(() => {
    if (view === 'admin' && (!user || userProfile?.role !== 'admin' || !currentSessionId)) {
      setView('shop');
    }
  }, [view, user, userProfile, currentSessionId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  useEffect(() => {
    if (selectedProduct) {
      setActiveImage(selectedProduct.image);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedProduct]);

  const handleSubmitReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !reviewForm.user || !reviewForm.comment) return;
    
    setIsSubmittingReview(true);
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.id,
          ...reviewForm
        }),
      });
      
      if (response.ok) {
        // Refresh products to get updated reviews
        const allProducts = await fetchProducts();
        
        // Find the updated product in the new products list
        const updated = allProducts.find((p: Product) => p.id === selectedProduct.id);
        if (updated) {
          setSelectedProduct(updated);
        }
        
        // Reset form
        setReviewForm({ user: '', rating: 5, comment: '' });
      }
    } catch (error) {
      console.error('Error submitting review:', error);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: 'user' | 'admin') => {
    if (userId === user?.uid) {
      alert("You cannot change your own role.");
      return;
    }
    if (newRole === 'admin') {
      alert("Only the primary administrator account can have admin privileges.");
      return;
    }
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { role: newRole });
    } catch (error) {
      console.error('Error updating user role:', error);
      try {
        handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      } catch (err: any) {
        alert(`Failed to update user role: ${err.message}`);
      }
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { status: newStatus });
    } catch (error) {
      console.error('Error updating order status:', error);
      try {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
      } catch (err: any) {
        alert(`Failed to update order status: ${err.message}`);
      }
    }
  };

  const handleAdminAccess = () => {
    if (userProfile?.role === 'admin' && user?.email === 'abduaragaw1996@gmail.com') {
      setView('admin');
    } else {
      setIsAdminLoginModalOpen(true);
    }
  };

  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const generateProductImage = async (description: string, isEdit: boolean = false) => {
    if (!description) {
      setAdminSessionError("Please provide a product description first to generate an image.");
      return;
    }

    setIsGeneratingImage(true);
    setAdminSessionError("");
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: `Generate a high-quality, professional product image for: ${description}. The image should be clean, well-lit, and suitable for an e-commerce marketplace.`,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      let imageUrl = "";
      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64EncodeString = part.inlineData.data;
            imageUrl = `data:image/png;base64,${base64EncodeString}`;
            break;
          }
        }
      }

      if (imageUrl) {
        if (isEdit) {
          setEditingProduct(prev => prev ? { ...prev, image: imageUrl } : null);
        } else {
          setNewProduct(prev => ({ ...prev, image: imageUrl }));
        }
      } else {
        throw new Error("No image data returned from Gemini. Please try a more descriptive prompt.");
      }
    } catch (error: any) {
      console.error("Image Generation Error:", error);
      setAdminSessionError("Failed to generate image: " + (error.message || "Unknown error"));
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleAdminLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAdminSessionError('');
    
    try {
      let loggedInUser;
      if (adminAuthMode === 'register') {
        const userCredential = await createUserWithEmailAndPassword(auth, adminAuthForm.email, adminAuthForm.password);
        loggedInUser = userCredential.user;
        if (adminAuthForm.displayName) {
          await updateProfile(loggedInUser, { displayName: adminAuthForm.displayName });
        }
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, adminAuthForm.email, adminAuthForm.password);
        loggedInUser = userCredential.user;
      }
      
      await finalizeAdminLogin(loggedInUser);
    } catch (error: any) {
      handleAdminAuthError(error);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAdminGoogleLogin = async () => {
    setIsAuthLoading(true);
    setAdminSessionError('');
    
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      await finalizeAdminLogin(userCredential.user);
    } catch (error: any) {
      handleAdminAuthError(error);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const finalizeAdminLogin = async (loggedInUser: FirebaseUser) => {
    // Check role
    let userDoc;
    try {
      userDoc = await getDoc(doc(db, 'users', loggedInUser.uid));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${loggedInUser.uid}`);
    }
    let profile = userDoc.data() as UserProfile;
    
    // Bootstrap Admin: If it's the designated admin email, ensure they have the admin role
    if (loggedInUser.email === 'abduaragaw1996@gmail.com') {
      if (!profile || profile.role !== 'admin') {
        const updatedProfile: UserProfile = profile ? {
          ...profile,
          role: 'admin'
        } : {
          uid: loggedInUser.uid,
          email: loggedInUser.email!,
          displayName: adminAuthForm.displayName || loggedInUser.displayName || 'Admin',
          photoURL: loggedInUser.photoURL || `https://ui-avatars.com/api/?name=Admin&background=random`,
          role: 'admin',
          createdAt: new Date().toISOString()
        };
        
        try {
          await setDoc(doc(db, 'users', loggedInUser.uid), updatedProfile);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${loggedInUser.uid}`);
        }
        profile = updatedProfile;
      }
    }

    if (profile?.role !== 'admin') {
      await signOut(auth);
      setAdminSessionError('Access denied. This area is restricted to administrators.');
      return;
    }

    // Session lock
    const sessionRef = doc(db, 'admin_sessions', 'current');
    let sessionSnap;
    try {
      sessionSnap = await getDoc(sessionRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'admin_sessions/current');
    }
    
    if (sessionSnap.exists()) {
      const sessionData = sessionSnap.data() as AdminSession;
      const lastActive = new Date(sessionData.lastActive).getTime();
      const now = new Date().getTime();
      
      // If session is active (last 5 mins) and it's a different session
      if (now - lastActive < 300000 && sessionData.sessionId !== currentSessionId) {
        await signOut(auth);
        setAdminSessionError('Another administrator is currently active. Only one admin session is allowed at a time.');
        return;
      }
    }

    const newSessionId = Math.random().toString(36).substring(2, 15);
    try {
      await setDoc(sessionRef, {
        uid: loggedInUser.uid,
        email: loggedInUser.email,
        sessionId: newSessionId,
        lastActive: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'admin_sessions/current');
    }
    
    localStorage.setItem('admin_session_id', newSessionId);
    setCurrentSessionId(newSessionId);
    setIsAdminLoginModalOpen(false);
    setView('admin');
    setAdminAuthForm({ email: '', password: '', displayName: '' });
    setAdminSessionError('');
  };

  const handleAdminAuthError = (error: any) => {
    console.error('Admin Auth Error:', error);
    let errorMessage = error.message || 'An unexpected error occurred during admin authentication.';
    const errorCode = error.code || (error.message?.includes('auth/') ? error.message.match(/\((auth\/[^)]+)\)/)?.[1] : null);
    
    try {
      const parsedError = JSON.parse(error.message);
      if (parsedError.error && parsedError.error.includes('insufficient permissions')) {
        errorMessage = `Permission Denied: Your account (${parsedError.authInfo.email || 'unknown'}) is not authorized for this operation (${parsedError.operationType} on ${parsedError.path}).`;
      }
    } catch (e) {
      // Not a JSON error
    }

    if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password') {
      setAdminSessionError('Invalid admin email or password. If you forgot your password, use the reset link or sign in with Google.');
    } else if (errorCode === 'auth/too-many-requests') {
      setAdminSessionError('Too many failed login attempts. Please try again later.');
    } else if (errorCode === 'auth/email-already-in-use') {
      setAdminSessionError('This email is already registered. Please sign in instead.');
    } else if (errorCode === 'auth/popup-closed-by-user') {
      setAdminSessionError('Sign-in popup was closed. Please try again.');
    } else {
      setAdminSessionError(errorMessage);
    }
  };

  const parseSpecs = (specsString: string) => {
    try {
      if (!specsString) return [];
      const parsed = JSON.parse(specsString);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  const updateSpecs = (specs: { key: string; value: string }[], isEdit: boolean) => {
    const jsonString = JSON.stringify(specs);
    if (isEdit) {
      setEditingProduct(prev => prev ? { ...prev, technical_specs: jsonString } : null);
    } else {
      setNewProduct(prev => ({ ...prev, technical_specs: jsonString }));
    }
  };

  const addSpecRow = (isEdit: boolean) => {
    const currentSpecs = parseSpecs(isEdit ? editingProduct?.technical_specs || '' : newProduct.technical_specs);
    updateSpecs([...currentSpecs, { key: '', value: '' }], isEdit);
  };

  const removeSpecRow = (index: number, isEdit: boolean) => {
    const currentSpecs = parseSpecs(isEdit ? editingProduct?.technical_specs || '' : newProduct.technical_specs);
    const newSpecs = currentSpecs.filter((_, i) => i !== index);
    updateSpecs(newSpecs, isEdit);
  };

  const handleSpecChange = (index: number, field: 'key' | 'value', value: string, isEdit: boolean) => {
    const currentSpecs = parseSpecs(isEdit ? editingProduct?.technical_specs || '' : newProduct.technical_specs);
    const newSpecs = [...currentSpecs];
    newSpecs[index] = { ...newSpecs[index], [field]: value };
    updateSpecs(newSpecs, isEdit);
  };

  const handleAdminForgotPassword = async () => {
    if (!adminAuthForm.email) {
      setAdminSessionError('Please enter your admin email address first.');
      return;
    }
    
    setIsForgotPasswordLoading(true);
    setAdminSessionError('');
    setForgotPasswordSuccess('');
    
    try {
      await sendPasswordResetEmail(auth, adminAuthForm.email);
      setForgotPasswordSuccess('Password reset email sent! Please check your inbox.');
    } catch (error: any) {
      console.error('Forgot Password Error:', error);
      setAdminSessionError(error.message || 'Failed to send password reset email.');
    } finally {
      setIsForgotPasswordLoading(false);
    }
  };

  const handleAddProduct = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct),
      });
      if (response.ok) {
        setNewProduct({ 
          name: '', price: 0, description: '', image: '', shopName: '', 
          category: 'Electronics', moq: '1 piece', location: 'Sodo, Ethiopia',
          isFeatured: false, technical_specs: ''
        });
        fetchProducts();
        fetchBackendStats();
      }
    } catch (error) {
      console.error('Error adding product:', error);
    }
  };

  const handleDeleteProduct = (id: number) => {
    setProductToDelete(id);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct({ ...product });
    setIsEditModalOpen(true);
  };

  const handleUpdateProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    try {
      const response = await fetch(`/api/admin/update/${editingProduct.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingProduct),
      });

      if (response.ok) {
        setIsEditModalOpen(false);
        setEditingProduct(null);
        fetchProducts();
        fetchBackendStats();
      } else {
        alert('Failed to update product.');
      }
    } catch (error) {
      console.error('Update Product Error:', error);
      alert('An error occurred while updating the product.');
    }
  };

  const confirmDelete = async () => {
    if (productToDelete === null) return;
    try {
      const response = await fetch(`/api/admin/delete/${productToDelete}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        removeFromCart(productToDelete);
        if (selectedProduct?.id === productToDelete) {
          setSelectedProduct(null);
          setView('shop');
        }
        fetchProducts();
        fetchBackendStats();
      }
    } catch (error) {
      console.error('Error deleting product:', error);
    } finally {
      setProductToDelete(null);
    }
  };

  const toggleFeatured = async (id: number, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/featured/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFeatured: !currentStatus }),
      });
      if (response.ok) {
        fetchProducts();
      }
    } catch (error) {
      console.error('Error toggling featured status:', error);
    }
  };

  const handleImageMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setZoomPos({ x, y });
  };

  const addToCart = (product: Product) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart(prevCart => prevCart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.id === productId) {
        const newQuantity = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const cartTotalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleContactSupplier = (product: Product, confirmed = false) => {
    if (!buyerInfo.name || !buyerInfo.phone || !buyerInfo.location) {
      setPendingAction({ type: 'contact', product });
      setShowBuyerForm(true);
      return;
    }

    if (!confirmed) {
      setTelegramAction({ type: 'contact', product });
      setShowTelegramConfirmation(true);
      return;
    }
    
    const buyerDetails = `\n\nBuyer Info:\nName: ${buyerInfo.name}\nPhone: ${buyerInfo.phone}\nLocation: ${buyerInfo.location}`;
    const text = encodeURIComponent(`Hello! I'm interested in "${product.name}" from "${product.shopName || 'your shop'}".\nMOQ: ${product.moq}\nLocation: ${product.location}${buyerDetails}`);
    window.open(`https://t.me/${TELEGRAM_USERNAME}?text=${text}`, '_blank');
  };

  const getTelegramLink = (product: Product) => {
    const buyerDetails = buyerInfo.name ? `\n\nBuyer Info:\nName: ${buyerInfo.name}\nPhone: ${buyerInfo.phone}\nLocation: ${buyerInfo.location}` : '';
    const text = encodeURIComponent(`Hello! I'm interested in "${product.name}" from "${product.shopName || 'your shop'}".\nMOQ: ${product.moq}\nLocation: ${product.location}${buyerDetails}`);
    return `https://t.me/${TELEGRAM_USERNAME}?text=${text}`;
  };

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [assistantMessages]);

  const handleAssistantSend = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!assistantInput.trim()) return;

    const userMsg = assistantInput.trim();
    setAssistantInput('');
    setAssistantMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsAssistantThinking(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const systemInstruction = `You are an expert shopping assistant for "AB Marketplace", an Ethiopian e-commerce platform. 
      You help users find products, compare them, and answer questions about the marketplace.
      Current products available: ${JSON.stringify(products.map(p => ({ id: p.id, name: p.name, price: p.price, category: p.category, rating: p.reviews?.reduce((acc, r) => acc + r.rating, 0) / (p.reviews?.length || 1) || 0 }))) }
      Always be helpful, professional, and provide detailed reasoning when comparing products.
      Use Markdown for formatting.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [...assistantMessages, { role: 'user', content: userMsg }].map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });

      const aiResponse = response.text || "I'm sorry, I couldn't process that request.";
      setAssistantMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (error) {
      console.error('AI Assistant Error:', error);
      setAssistantMessages(prev => [...prev, { role: 'assistant', content: "I'm having trouble connecting to my brain right now. Please try again later!" }]);
    } finally {
      setIsAssistantThinking(false);
    }
  };

  const filteredProducts = useMemo(() => {
    let result = products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          product.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (product.shopName && product.shopName.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategory === "All Categories" || product.category === selectedCategory;
      const matchesPrice = product.price >= priceRange[0] && product.price <= priceRange[1];
      
      const avgRating = product.reviews && product.reviews.length > 0
        ? product.reviews.reduce((acc, r) => acc + r.rating, 0) / product.reviews.length
        : 0;
      const matchesRating = avgRating >= minRating;

      return matchesSearch && matchesCategory && matchesPrice && matchesRating;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'price-low') return a.price - b.price;
      if (sortBy === 'price-high') return b.price - a.price;
      if (sortBy === 'rating') {
        const ratingA = a.reviews?.reduce((acc, r) => acc + r.rating, 0) / (a.reviews?.length || 1) || 0;
        const ratingB = b.reviews?.reduce((acc, r) => acc + r.rating, 0) / (b.reviews?.length || 1) || 0;
        return ratingB - ratingA;
      }
      return b.id - a.id; // newest
    });

    return result;
  }, [products, searchQuery, selectedCategory, priceRange, minRating, sortBy]);

  const featuredProducts = useMemo(() => {
    return products.filter(p => p.isFeatured).slice(0, 4);
  }, [products]);

  const relatedProducts = useMemo(() => {
    if (!selectedProduct) return [];
    return products
      .filter(p => p.category === selectedProduct.category && p.id !== selectedProduct.id)
      .slice(0, 4);
  }, [products, selectedProduct]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const handleCheckout = async (confirmed = false) => {
    if (cart.length === 0) return;
    
    if (!buyerInfo.name || !buyerInfo.phone || !buyerInfo.location) {
      setPendingAction({ type: 'checkout' });
      setShowBuyerForm(true);
      return;
    }

    if (!confirmed) {
      setTelegramAction({ type: 'checkout' });
      setShowTelegramConfirmation(true);
      return;
    }

    try {
      // Record order in backend for stats
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          totalAmount: cartTotalPrice
        })
      });

      // Construct Telegram message
      const buyerDetails = `\n\nBuyer Info:\nName: ${buyerInfo.name}\nPhone: ${buyerInfo.phone}\nLocation: ${buyerInfo.location}`;
      const itemsList = cart.map(item => `- ${item.name} x${item.quantity} ($${(item.price * item.quantity).toFixed(2)})`).join('\n');
      const text = encodeURIComponent(`New Order Request!\n\nItems:\n${itemsList}\n\nTotal: $${cartTotalPrice.toFixed(2)}${buyerDetails}\n\nPlease contact me for delivery.`);
      window.open(`https://t.me/${TELEGRAM_USERNAME}?text=${text}`, '_blank');
      
      // Clear cart
      setCart([]);
      setIsCartOpen(false);
      
      // Refresh stats if in admin view (though usually user is in shop view)
      fetchBackendStats();
    } catch (error) {
      console.error('Error during checkout:', error);
      // Still open telegram even if backend fails, to not block the user
      const buyerDetails = `\n\nBuyer Info:\nName: ${buyerInfo.name}\nPhone: ${buyerInfo.phone}\nLocation: ${buyerInfo.location}`;
      const itemsList = cart.map(item => `- ${item.name} x${item.quantity} ($${(item.price * item.quantity).toFixed(2)})`).join('\n');
      const text = encodeURIComponent(`New Order Request!\n\nItems:\n${itemsList}\n\nTotal: $${cartTotalPrice.toFixed(2)}${buyerDetails}\n\nPlease contact me for delivery.`);
      window.open(`https://t.me/${TELEGRAM_USERNAME}?text=${text}`, '_blank');
    }
  };

  const confirmTelegramAction = () => {
    if (!telegramAction) return;
    
    if (telegramAction.type === 'checkout') {
      handleCheckout(true);
    } else if (telegramAction.type === 'contact' && telegramAction.product) {
      handleContactSupplier(telegramAction.product, true);
    }
    
    setShowTelegramConfirmation(false);
    setTelegramAction(null);
  };

  const handleBuyerFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    setShowBuyerForm(false);
    
    if (pendingAction) {
      if (pendingAction.type === 'checkout') {
        handleCheckout();
      } else if (pendingAction.type === 'contact' && pendingAction.product) {
        handleContactSupplier(pendingAction.product);
      }
      setPendingAction(null);
    }
  };
  const adminFirestoreStats = useMemo(() => {
    const totalRevenue = allOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
    const totalOrders = allOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    // Calculate top categories from Firestore orders
    const categoryCounts: { [key: string]: number } = {};
    allOrders.forEach(order => {
      const cat = order.productName ? (products.find(p => p.name === order.productName)?.category || 'General') : 'General';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + (order.quantity || 0);
    });
    
    const topCategories = Object.entries(categoryCounts)
      .map(([category, total_sold]) => ({ category, total_sold }))
      .sort((a, b) => b.total_sold - a.total_sold)
      .slice(0, 5);

    // Calculate daily orders for the last 7 days
    const dailyOrders: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const count = allOrders.filter(order => {
        const orderDate = order.createdAt?.toDate ? order.createdAt.toDate().toISOString().split('T')[0] : '';
        return orderDate === dateStr;
      }).length;
      dailyOrders.push({ date: dateStr, count });
    }

    return {
      totalOrders,
      totalRevenue,
      avgOrderValue,
      topCategories,
      dailyOrders,
      totalUsers: allUsers.length
    };
  }, [allOrders, allUsers, products]);

  const adminStats = useMemo(() => {
    return {
      total: products.length,
      featured: products.filter(p => p.isFeatured).length,
      categories: new Set(products.map(p => p.category)).size
    };
  }, [products]);

  const filteredAdminProducts = useMemo(() => {
    const searchLower = adminProductSearch.toLowerCase();
    return products.filter(product => 
      product.name.toLowerCase().includes(searchLower) ||
      product.category.toLowerCase().includes(searchLower) ||
      (product.shopName && product.shopName.toLowerCase().includes(searchLower))
    );
  }, [products, adminProductSearch]);

  const sortedReviews = useMemo(() => {
    if (!selectedProduct) return [];
    
    const reviews = selectedProduct.reviews && selectedProduct.reviews.length > 0 
      ? [...selectedProduct.reviews] 
      : [
          { user: "Abebe K.", rating: 5, comment: "Excellent quality and fast delivery. Highly recommended!", date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
          { user: "Sara M.", rating: 4, comment: "Good product, exactly as described. The packaging was very secure.", date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
          { user: "Dawit L.", rating: 5, comment: "The supplier was very responsive on Telegram. Great experience.", date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() }
        ];

    return reviews.sort((a, b) => {
      if (reviewSortBy === 'newest') {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      } else if (reviewSortBy === 'rating-high') {
        return b.rating - a.rating;
      } else if (reviewSortBy === 'rating-low') {
        return a.rating - b.rating;
      }
      return 0;
    });
  }, [selectedProduct, reviewSortBy]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F2F3F7] font-sans text-[#333]">
      {/* Top Banner */}
      <div className="bg-[#FF6600] text-white py-2 px-4 text-center text-xs font-bold">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex gap-4">
            <span className="flex items-center gap-1"><Globe size={12} /> Global Sourcing</span>
            <span className="flex items-center gap-1"><ShieldCheck size={12} /> Trade Assurance</span>
          </div>
          <div className="hidden sm:block">One-stop B2B marketplace for AB vendors</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white border-b border-zinc-200 shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => {setView('shop'); setSelectedCategory('All Categories'); setSelectedProduct(null); setIsZoomed(false);}}>
            <div className="bg-[#FF6600] p-1.5 rounded-lg">
              <Package size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-black text-[#FF6600] tracking-tighter hidden sm:block">AB</h1>
          </div>

          {view !== 'admin' && (
            <div className="flex-1 max-w-2xl flex gap-2">
              {/* Category Dropdown */}
              <div className="relative hidden md:block">
                <button 
                  onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                  className="h-full px-4 border-2 border-zinc-200 rounded-full flex items-center gap-2 text-sm font-medium hover:bg-zinc-50 transition-colors whitespace-nowrap"
                >
                  {selectedCategory === "All Categories" ? "Categories" : selectedCategory}
                  <ChevronDown size={16} className={`transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {isCategoryDropdownOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 mt-2 w-56 bg-white border border-zinc-200 rounded-2xl shadow-xl py-2 z-[60]"
                    >
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat}
                          onClick={() => {
                            setSelectedCategory(cat);
                            setIsCategoryDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-zinc-50 transition-colors ${selectedCategory === cat ? 'text-[#FF6600] font-bold' : 'text-zinc-600'}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-zinc-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search products, suppliers..."
                  className="w-full bg-white border-2 border-[#FF6600] rounded-full py-2 pl-10 pr-12 text-sm focus:outline-none shadow-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-3 flex items-center text-zinc-400 hover:text-zinc-600"
                  >
                    <CloseIcon size={18} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setLowDataMode(!lowDataMode)}
              className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${lowDataMode ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
              title={lowDataMode ? "Disable Low Data Mode" : "Enable Low Data Mode"}
            >
              <Globe size={12} />
              {lowDataMode ? "Low Data: ON" : "Low Data"}
            </button>

            {/* User Profile / Auth */}
            <div className="flex items-center gap-2 border-l border-zinc-200 pl-3 ml-1">
              {user ? (
                <div className="relative group">
                  <button 
                    onClick={() => setView('profile')}
                    className="flex items-center gap-2 p-1 rounded-full hover:bg-zinc-100 transition-colors"
                  >
                    <SmartImage 
                      src={userProfile?.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random`} 
                      alt="Profile" 
                      className="w-8 h-8 rounded-full border border-zinc-200"
                      size="100/100"
                    />
                    <span className="hidden md:block text-sm font-bold text-zinc-700 max-w-[100px] truncate">
                      {userProfile?.displayName || user.displayName || 'User'}
                    </span>
                  </button>
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-zinc-200 rounded-2xl shadow-xl py-2 z-[60] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                    <button 
                      onClick={() => setView('profile')}
                      className="w-full text-left px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 flex items-center gap-2"
                    >
                      <UserIcon size={16} /> My Profile
                    </button>
                    <button 
                      onClick={() => setView('orders')}
                      className="w-full text-left px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 flex items-center gap-2"
                    >
                      <History size={16} /> My Orders
                    </button>
                    <div className="h-px bg-zinc-100 my-1"></div>
                    <button 
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
                    >
                      <LogOut size={16} /> Logout
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => {setAuthMode('login'); setShowAuthModal(true);}}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100 text-zinc-700 text-sm font-bold hover:bg-zinc-200 transition-all"
                >
                  <LogIn size={18} />
                  <span className="hidden sm:inline">Sign In</span>
                </button>
              )}
            </div>

            <div className="relative">
              <button 
                onClick={() => setIsCartOpen(true)}
                className="p-2 text-zinc-500 hover:text-[#FF6600] transition-colors relative"
              >
                <ShoppingCart size={24} />
                {cartTotalItems > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#FF6600] text-white text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center border-2 border-white">
                    {cartTotalItems}
                  </span>
                )}
              </button>
            </div>
            {view !== 'admin' ? (
              <button 
                onClick={handleAdminAccess}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200 hover:bg-zinc-50 transition-colors text-sm font-medium"
              >
                <Settings size={18} className="text-zinc-500" />
                <span className="hidden sm:inline">Supplier Center</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setView('shop')}
                  className="p-2 text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  <ArrowLeft size={24} />
                </button>
                <h1 className="text-lg font-bold hidden sm:block">Admin Panel</h1>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-red-500 hover:text-red-600 transition-colors"
                >
                  <LogOut size={24} />
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {view === 'shop' ? (
        <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col md:flex-row gap-6">
          {/* Sidebar Categories */}
          <aside className="w-full md:w-64 shrink-0 space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-zinc-100">
              <h2 className="font-bold text-sm uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
                <Filter size={16} /> Categories
              </h2>
              <div className="space-y-1">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between group ${
                      selectedCategory === cat 
                      ? 'bg-[#FFF0E6] text-[#FF6600] font-bold' 
                      : 'text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    {cat}
                    <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 transition-opacity ${selectedCategory === cat ? 'opacity-100' : ''}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-zinc-800 mb-4 flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-[#FF6600]" />
                  Price Range
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      placeholder="Min"
                      value={priceRange[0]}
                      onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6600]/20"
                    />
                    <span className="text-zinc-400">-</span>
                    <input 
                      type="number" 
                      placeholder="Max"
                      value={priceRange[1]}
                      onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6600]/20"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-zinc-800 mb-4 flex items-center gap-2">
                  <Star size={16} className="text-[#FF6600]" />
                  Minimum Rating
                </h3>
                <div className="flex flex-col gap-2">
                  {[4, 3, 2, 1].map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setMinRating(rating === minRating ? 0 : rating)}
                      className={`flex items-center gap-2 text-sm transition-colors ${minRating === rating ? 'text-[#FF6600] font-bold' : 'text-zinc-500 hover:text-zinc-800'}`}
                    >
                      <div className="flex gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            size={12} 
                            fill={i < rating ? "currentColor" : "none"} 
                            className={i < rating ? "text-orange-400" : "text-zinc-200"} 
                          />
                        ))}
                      </div>
                      & Up
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => {
                  setPriceRange([0, 10000]);
                  setMinRating(0);
                  setSelectedCategory('All Categories');
                  setSearchQuery('');
                }}
                className="w-full text-xs font-bold text-zinc-400 hover:text-[#FF6600] transition-colors uppercase tracking-widest pt-2 border-t border-zinc-100"
              >
                Reset All Filters
              </button>
            </div>

            <div className="bg-gradient-to-br from-[#FF6600] to-[#FF9900] rounded-xl p-5 text-white shadow-md">
              <h3 className="font-bold mb-2">Source with Confidence</h3>
              <p className="text-xs opacity-90 leading-relaxed">Verified suppliers and trade assurance for every order in AB.</p>
              <button className="mt-4 w-full bg-white text-[#FF6600] py-2 rounded-lg text-xs font-bold hover:bg-zinc-50 transition-colors">
                Learn More
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 space-y-8">
            {/* Featured Section */}
            {selectedCategory === "All Categories" && !searchQuery && featuredProducts.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-[#FF6600]">
                  <TrendingUp size={20} />
                  <h2 className="text-lg font-bold">Featured Products</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {featuredProducts.map(product => (
                    <motion.div 
                      key={product.id}
                      whileHover={{ y: -5 }}
                      className="bg-white rounded-xl overflow-hidden shadow-sm border border-orange-100 relative group cursor-pointer"
                      onClick={() => {
                        setSelectedProduct(product);
                        setView('detail');
                      }}
                    >
                      <div className="absolute top-2 right-2 z-10 bg-orange-500 text-white p-1 rounded-full shadow-lg">
                        <Star size={14} fill="currentColor" />
                      </div>
                      <div className="aspect-square">
                        <SmartImage src={product.image} alt={product.name} size="300/300" lowData={lowDataMode} />
                      </div>
                      <div className="p-3">
                        <h3 className="text-xs font-bold truncate mb-1">{product.name}</h3>
                        <p className="text-[#FF6600] font-black text-sm">${product.price.toFixed(2)}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-zinc-800">
                  {selectedCategory === "All Categories" ? "Recommended for You" : selectedCategory}
                  <span className="ml-2 text-sm font-normal text-zinc-400">({filteredProducts.length} items)</span>
                </h2>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-none">
                    <select 
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="w-full appearance-none bg-white border border-zinc-200 rounded-xl px-4 py-2 pr-10 text-sm font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#FF6600]/20 cursor-pointer shadow-sm"
                    >
                      <option value="newest">Newest Arrivals</option>
                      <option value="price-low">Price: Low to High</option>
                      <option value="price-high">Price: High to Low</option>
                      <option value="rating">Avg. Customer Review</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-white rounded-xl overflow-hidden border border-zinc-100 shadow-sm">
                      <div className="aspect-square bg-zinc-100 animate-pulse"></div>
                      <div className="p-4 space-y-3">
                        <div className="h-4 bg-zinc-100 rounded animate-pulse w-3/4"></div>
                        <div className="h-4 bg-zinc-100 rounded animate-pulse w-1/2"></div>
                        <div className="flex justify-between items-center pt-2">
                          <div className="h-6 bg-zinc-100 rounded animate-pulse w-1/4"></div>
                          <div className="h-8 w-8 bg-zinc-100 rounded-full animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white rounded-2xl p-20 flex flex-col items-center justify-center text-zinc-400 shadow-sm border border-zinc-100">
                  <Package size={64} className="mb-4 opacity-10" />
                  <p className="text-lg">No products found matching your criteria</p>
                  <button 
                    onClick={() => {setSearchQuery(''); setSelectedCategory('All Categories');}}
                    className="mt-4 text-[#FF6600] font-bold hover:underline"
                  >
                    Clear all filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paginatedProducts.map((product) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-xl overflow-hidden flex flex-col border border-zinc-100 shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
                      onClick={() => {
                        setSelectedProduct(product);
                        setView('detail');
                      }}
                    >
                      <div className="aspect-square overflow-hidden relative">
                        <SmartImage 
                          src={product.image || 'https://picsum.photos/seed/placeholder/400/300'} 
                          alt={product.name} 
                          className="h-full w-full transition-transform duration-500 group-hover:scale-105"
                          size="400/400"
                        />
                        <div className="absolute top-2 left-2 flex flex-col gap-1">
                          <span className="bg-white/90 backdrop-blur-sm text-[10px] font-bold px-2 py-0.5 rounded shadow-sm text-zinc-600">
                            {product.category}
                          </span>
                          {product.isFeatured && (
                            <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                              <Star size={10} fill="currentColor" /> Featured
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="p-4 flex flex-col flex-1">
                        <h3 className="font-medium text-sm leading-tight mb-2 line-clamp-2 group-hover:text-[#FF6600] transition-colors">{product.name}</h3>
                        
                        <div className="flex items-baseline gap-1 mb-1">
                          <span className="text-lg font-black text-[#333]">${product.price.toFixed(2)}</span>
                          <span className="text-[10px] text-zinc-400">/ piece</span>
                        </div>

                        {product.reviews && product.reviews.length > 0 && (
                          <div className="flex items-center gap-1.5 mb-3">
                            <div className="flex gap-0.5">
                              {[...Array(5)].map((_, i) => {
                                const avgRating = product.reviews!.reduce((acc, r) => acc + r.rating, 0) / product.reviews!.length;
                                return (
                                  <Star 
                                    key={i} 
                                    size={10} 
                                    fill={i < Math.round(avgRating) ? "currentColor" : "none"} 
                                    className={i < Math.round(avgRating) ? "text-orange-400" : "text-zinc-200"} 
                                  />
                                );
                              })}
                            </div>
                            <span className="text-[10px] font-bold text-zinc-400">({product.reviews.length})</span>
                          </div>
                        )}

                        <div className="space-y-1.5 mb-4 flex-1">
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <Box size={14} className="text-zinc-400" />
                            <span>MOQ: <span className="text-zinc-800 font-medium">{product.moq}</span></span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <MapPin size={14} className="text-zinc-400" />
                            <span>{product.location}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[#FF6600] font-medium">
                            <ShieldCheck size={14} />
                            <span>Verified Supplier</span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-tighter">Supplier</span>
                            <span className="text-xs font-bold text-zinc-700 truncate max-w-[100px]">{product.shopName}</span>
                          </div>
                          <button 
                            onClick={() => handleContactSupplier(product)}
                            className="flex items-center justify-center gap-1.5 bg-[#FF6600] hover:bg-[#E65C00] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-sm"
                          >
                            <Send size={14} fill="currentColor" />
                            Contact
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    
                    <div className="flex items-center gap-1 mx-2">
                      {[...Array(totalPages)].map((_, i) => {
                        const pageNum = i + 1;
                        // Simple logic to show only some pages if many
                        if (
                          totalPages <= 7 ||
                          pageNum === 1 ||
                          pageNum === totalPages ||
                          (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                        ) {
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${
                                currentPage === pageNum
                                  ? 'bg-[#FF6600] text-white shadow-md shadow-orange-100'
                                  : 'text-zinc-500 hover:bg-zinc-100'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        } else if (
                          (pageNum === 2 && currentPage > 4) ||
                          (pageNum === totalPages - 1 && currentPage < totalPages - 3)
                        ) {
                          return <span key={pageNum} className="px-1 text-zinc-300">...</span>;
                        }
                        return null;
                      })}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                    Page {currentPage} of {totalPages}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      ) : view === 'detail' && selectedProduct ? (
        <main className="mx-auto max-w-6xl px-4 py-8">
          <button 
            onClick={() => {setView('shop'); setIsZoomed(false);}}
            className="flex items-center gap-2 text-zinc-500 hover:text-[#FF6600] transition-colors mb-6 font-medium"
          >
            <ArrowLeft size={20} />
            Back to Marketplace
          </button>

          {loading ? (
            <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
              <div className="flex flex-col lg:flex-row">
                <div className="lg:w-1/2 p-10 bg-zinc-50">
                  <div className="aspect-square bg-zinc-100 rounded-2xl animate-pulse"></div>
                  <div className="flex gap-2 mt-4 overflow-hidden">
                    <div className="w-20 h-20 bg-zinc-100 rounded-xl animate-pulse"></div>
                    <div className="w-20 h-20 bg-zinc-100 rounded-xl animate-pulse"></div>
                    <div className="w-20 h-20 bg-zinc-100 rounded-xl animate-pulse"></div>
                  </div>
                </div>
                <div className="lg:w-1/2 p-10 space-y-6">
                  <div className="space-y-2">
                    <div className="h-4 bg-zinc-100 rounded w-1/4 animate-pulse"></div>
                    <div className="h-10 bg-zinc-100 rounded w-3/4 animate-pulse"></div>
                    <div className="h-8 bg-zinc-100 rounded w-1/3 animate-pulse"></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-20 bg-zinc-100 rounded-2xl animate-pulse"></div>
                    <div className="h-20 bg-zinc-100 rounded-2xl animate-pulse"></div>
                  </div>
                  <div className="h-32 bg-zinc-100 rounded-2xl animate-pulse"></div>
                  <div className="h-14 bg-zinc-100 rounded-2xl animate-pulse"></div>
                </div>
              </div>
            </div>
          ) : (
            <>
            <div className="bg-white rounded-3xl shadow-xl border border-zinc-100 overflow-hidden">
            <div className="flex flex-col lg:flex-row">
              {/* Product Image Section */}
              <div className="lg:w-1/2 p-6 lg:p-10 bg-zinc-50">
                <div className="space-y-4">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="aspect-square rounded-2xl overflow-hidden shadow-2xl border border-white relative cursor-zoom-in"
                    onMouseMove={handleImageMouseMove}
                    onMouseEnter={() => setIsZoomed(true)}
                    onMouseLeave={() => setIsZoomed(false)}
                  >
                    <SmartImage 
                      src={activeImage || selectedProduct.image} 
                      alt={selectedProduct.name} 
                      className="w-full h-full transition-transform duration-200 ease-out"
                      size="800/800"
                      loading="eager"
                      style={{
                        transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                        transform: isZoomed ? 'scale(2.5)' : 'scale(1)'
                      }}
                    />
                    {!isZoomed && (
                      <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-2 pointer-events-none">
                        <Search size={12} /> Hover to zoom
                      </div>
                    )}
                  </motion.div>

                  {/* Image Gallery Thumbnails */}
                  {selectedProduct.images && selectedProduct.images.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {[selectedProduct.image, ...(selectedProduct.images || [])].map((img, idx) => (
                          <button
                            key={idx}
                            onClick={() => setActiveImage(img)}
                            className={`w-20 h-20 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0 ${
                              (activeImage || selectedProduct.image) === img ? 'border-[#FF6600] scale-95' : 'border-transparent opacity-60 hover:opacity-100'
                            }`}
                          >
                            <SmartImage src={img} alt="" className="w-full h-full" size="200/200" />
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Product Info Section */}
              <div className="lg:w-1/2 p-6 lg:p-10 flex flex-col">
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-orange-100 text-[#FF6600] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      {selectedProduct.category}
                    </span>
                    {selectedProduct.isFeatured && (
                      <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                        <Star size={12} fill="currentColor" /> Featured
                      </span>
                    )}
                  </div>
                  <h1 className="text-3xl lg:text-4xl font-black text-zinc-900 leading-tight mb-4">
                    {selectedProduct.name}
                  </h1>
                  <div className="flex items-baseline gap-2 mb-6">
                    <span className="text-4xl font-black text-[#FF6600]">${selectedProduct.price.toFixed(2)}</span>
                    <span className="text-zinc-400 font-medium">/ piece</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <p className="text-[10px] text-zinc-400 font-bold uppercase mb-1">Minimum Order</p>
                    <div className="flex items-center gap-2 text-zinc-800 font-bold">
                      <Box size={18} className="text-[#FF6600]" />
                      {selectedProduct.moq}
                    </div>
                  </div>
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <p className="text-[10px] text-zinc-400 font-bold uppercase mb-1">Shipping From</p>
                    <div className="flex items-center gap-2 text-zinc-800 font-bold">
                      <MapPin size={18} className="text-[#FF6600]" />
                      {selectedProduct.location}
                    </div>
                  </div>
                </div>

                <div className="mb-8 flex-1">
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-3">Product Description</h3>
                  <p className="text-zinc-600 leading-relaxed whitespace-pre-wrap">
                    {selectedProduct.description}
                  </p>
                </div>

                {/* Collapsible Specifications Section */}
                <div className="mb-8 border border-zinc-100 rounded-2xl overflow-hidden">
                  <button 
                    onClick={() => setIsSpecsExpanded(!isSpecsExpanded)}
                    className="w-full flex items-center justify-between p-5 bg-zinc-50 hover:bg-zinc-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center text-[#FF6600] shadow-sm border border-zinc-100">
                        <SlidersHorizontal size={20} />
                      </div>
                      <div className="text-left">
                        <span className="block font-bold text-zinc-900">Technical Specifications</span>
                        <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-widest">View detailed information</span>
                      </div>
                    </div>
                    <motion.div
                      animate={{ rotate: isSpecsExpanded ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ChevronDown size={20} className="text-zinc-400" />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {isSpecsExpanded && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="p-6 bg-white border-t border-zinc-100 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-4">
                          {(() => {
                            try {
                              if (selectedProduct.technical_specs) {
                                const parsed = JSON.parse(selectedProduct.technical_specs);
                                if (Array.isArray(parsed)) return parsed;
                              }
                            } catch (e) {
                              console.error("Failed to parse technical specs:", e);
                            }
                            return selectedProduct.specifications || [
                              { key: "Material", value: "Premium Quality" },
                              { key: "Weight", value: "0.5 kg" },
                              { key: "Dimensions", value: "20 x 15 x 10 cm" },
                              { key: "Warranty", value: "1 Year Manufacturer Warranty" },
                              { key: "Origin", value: "Imported" },
                              { key: "Color", value: "As shown in image" }
                            ];
                          })().map((spec: any, idx: number) => (
                            <div key={idx} className="flex justify-between py-3 border-b border-zinc-50 last:border-0">
                              <span className="text-zinc-400 text-sm font-medium">{spec.key}</span>
                              <span className="text-zinc-900 text-sm font-bold">{spec.value}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="pt-8 border-t border-zinc-100 flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-1 w-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-12 w-12 bg-zinc-100 rounded-full flex items-center justify-center text-[#FF6600] font-black text-xl">
                        {selectedProduct.shopName?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400 font-bold uppercase">Supplier</p>
                        <p className="font-bold text-zinc-900">{selectedProduct.shopName}</p>
                      </div>
                      <div className="ml-auto flex items-center gap-1 text-[#FF6600] text-xs font-bold">
                        <ShieldCheck size={16} /> Verified
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button 
                        onClick={() => addToCart(selectedProduct)}
                        className="flex-1 flex items-center justify-center gap-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 py-4 rounded-2xl font-bold transition-all active:scale-95 text-lg"
                      >
                        <ShoppingCart size={20} />
                        Add to Cart
                      </button>
                      <button 
                        onClick={() => handlePlaceOrder(selectedProduct, 1)}
                        disabled={isOrdering}
                        className="flex-1 flex items-center justify-center gap-3 bg-zinc-900 hover:bg-black text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg text-lg disabled:opacity-50"
                      >
                        {isOrdering ? <Loader2 className="animate-spin" size={20} /> : <CreditCard size={20} />}
                        {isOrdering ? 'Ordering...' : 'Buy Now'}
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => handleContactSupplier(selectedProduct)}
                        className="flex items-center justify-center gap-3 bg-[#FF6600] hover:bg-[#E65C00] text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-100 text-lg"
                      >
                        <Send size={20} fill="currentColor" />
                        Contact Supplier
                      </button>
                        <a 
                          href={`tel:${SUPPORT_PHONE}`}
                          className="flex items-center justify-center gap-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 py-3 rounded-2xl font-bold transition-all active:scale-95 text-sm"
                        >
                          <Phone size={16} />
                          Call Alternative: {SUPPORT_PHONE}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            {/* Reviews Section */}
            <div className="border-t border-zinc-100 p-6 lg:p-10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
                <div>
                  <h3 className="text-2xl font-black text-zinc-900">Customer Reviews</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={14} className={i < 4.8 ? "text-orange-400 fill-orange-400" : "text-zinc-200"} />
                      ))}
                    </div>
                    <span className="font-bold text-zinc-900">4.8</span>
                    <span className="text-zinc-400 text-sm font-medium">({selectedProduct.reviews?.length || 24} reviews)</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Sort By:</span>
                  <select 
                    value={reviewSortBy}
                    onChange={(e) => setReviewSortBy(e.target.value as any)}
                    className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm font-bold text-zinc-700 focus:outline-none focus:border-[#FF6600] transition-all cursor-pointer"
                  >
                    <option value="newest">Newest First</option>
                    <option value="rating-high">Highest Rating</option>
                    <option value="rating-low">Lowest Rating</option>
                  </select>
                </div>
              </div>

              <div className="space-y-8">
                <div className="space-y-8">
                  {sortedReviews.map((review, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="h-10 w-10 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-400 font-bold shrink-0">
                        {review.user.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-bold text-zinc-900">{review.user}</h4>
                          <span className="text-xs text-zinc-400">
                            {isNaN(new Date(review.date).getTime()) ? review.date : new Date(review.date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex gap-0.5 mb-2">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} size={12} className={i < review.rating ? "text-orange-400 fill-orange-400" : "text-zinc-200"} />
                          ))}
                        </div>
                        <p className="text-zinc-600 text-sm leading-relaxed">{review.comment}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Review Form */}
                <div className="mt-12 pt-12 border-t border-zinc-100">
                  <h3 className="text-xl font-bold text-zinc-900 mb-6">Write a Review</h3>
                  <form onSubmit={handleSubmitReview} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Your Name</label>
                        <input 
                          type="text"
                          required
                          value={reviewForm.user}
                          onChange={e => setReviewForm({ ...reviewForm, user: e.target.value })}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                          placeholder="Enter your name"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Rating</label>
                        <div className="flex gap-2 py-4">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                              className="transition-transform active:scale-90"
                            >
                              <Star 
                                size={24} 
                                className={star <= reviewForm.rating ? "text-orange-400 fill-orange-400" : "text-zinc-200"} 
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Your Comment</label>
                      <textarea 
                        required
                        value={reviewForm.comment}
                        onChange={e => setReviewForm({ ...reviewForm, comment: e.target.value })}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all min-h-[120px]"
                        placeholder="Share your experience with this product..."
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={isSubmittingReview}
                      className="bg-[#FF6600] text-white px-8 py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-100 disabled:opacity-50 disabled:scale-100"
                    >
                      {isSubmittingReview ? <Loader2 className="animate-spin" size={18} /> : null}
                      {isSubmittingReview ? 'Submitting...' : 'Submit Review'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>

          {/* Related Products Section */}
          {relatedProducts.length > 0 && (
            <div className="mt-16">
              <div className="flex items-center gap-4 mb-8">
                <div className="h-10 w-10 bg-orange-50 rounded-xl flex items-center justify-center text-[#FF6600]">
                  <Box size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-zinc-900">Related Products</h2>
                  <p className="text-zinc-400 text-sm">More from {selectedProduct.category}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {relatedProducts.map(product => (
                  <motion.div
                    key={product.id}
                    whileHover={{ y: -8 }}
                    onClick={() => {
                      setSelectedProduct(product);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="group bg-white rounded-3xl overflow-hidden border border-zinc-100 shadow-sm hover:shadow-2xl transition-all cursor-pointer flex flex-col h-full"
                  >
                    <div className="aspect-square overflow-hidden relative">
                      <SmartImage 
                        src={product.image} 
                        alt={product.name} 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                        lowData={lowDataMode}
                      />
                      <div className="absolute top-4 left-4">
                        <span className="bg-white/90 backdrop-blur-md text-zinc-900 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
                          {product.category}
                        </span>
                      </div>
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <h3 className="font-bold text-zinc-900 mb-1 line-clamp-1 group-hover:text-[#FF6600] transition-colors">{product.name}</h3>
                      <p className="text-zinc-400 text-xs mb-4 flex items-center gap-1">
                        <MapPin size={10} /> {product.location}
                      </p>
                      <div className="mt-auto flex items-center justify-between">
                        <span className="text-lg font-black text-[#FF6600]">${product.price.toFixed(2)}</span>
                        <div className="h-8 w-8 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400 group-hover:bg-[#FF6600] group-hover:text-white transition-all">
                          <ChevronRight size={18} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
            </>
          )}
        </main>
      ) : view === 'profile' && user ? (
        <main className="mx-auto max-w-4xl px-4 py-12">
          <div className="flex items-center gap-4 mb-10">
            <button 
              onClick={() => setView('shop')}
              className="h-12 w-12 bg-white rounded-2xl flex items-center justify-center text-zinc-400 hover:text-[#FF6600] transition-all shadow-sm border border-zinc-100"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-3xl font-black text-zinc-900">My Profile</h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-zinc-100 text-center">
                <div className="relative inline-block mb-6">
                  <SmartImage 
                    src={userProfile?.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random`} 
                    alt="Profile" 
                    className="w-32 h-32 rounded-[2rem] border-4 border-orange-50 shadow-lg"
                    size="200/200"
                  />
                  <div className="absolute -bottom-2 -right-2 h-10 w-10 bg-[#FF6600] rounded-xl flex items-center justify-center text-white shadow-lg">
                    <Star size={20} fill="currentColor" />
                  </div>
                </div>
                <h2 className="text-2xl font-black text-zinc-900 mb-1">{userProfile?.displayName || user.displayName}</h2>
                <p className="text-zinc-400 text-sm mb-6">{user.email}</p>
                <div className="flex flex-col gap-3">
                  <div className="bg-zinc-50 rounded-2xl p-4 flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Role</span>
                    <span className="bg-orange-100 text-[#FF6600] text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                      {userProfile?.role || 'User'}
                    </span>
                  </div>
                  <div className="bg-zinc-50 rounded-2xl p-4 flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Joined</span>
                    <span className="text-zinc-800 font-bold text-sm">
                      {userProfile?.createdAt ? new Date(userProfile.createdAt).toLocaleDateString() : 'Recently'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-zinc-100">
                <h3 className="text-xl font-black text-zinc-900 mb-6 flex items-center gap-3">
                  <Settings size={24} className="text-[#FF6600]" /> Account Settings
                </h3>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Display Name</label>
                      <input 
                        type="text"
                        disabled
                        value={userProfile?.displayName || user.displayName || ''}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 px-5 text-zinc-500 cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Email Address</label>
                      <input 
                        type="email"
                        disabled
                        value={user.email || ''}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 px-5 text-zinc-500 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl text-orange-700 text-sm flex items-start gap-3">
                    <ShieldCheck size={20} className="mt-0.5 shrink-0" />
                    <p>Your account is secured with Firebase Authentication. Profile editing is currently disabled for security reasons.</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-zinc-100">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black text-zinc-900 flex items-center gap-3">
                    <History size={24} className="text-[#FF6600]" /> Recent Activity
                  </h3>
                  <button 
                    onClick={() => setView('orders')}
                    className="text-sm font-bold text-[#FF6600] hover:underline"
                  >
                    View All Orders
                  </button>
                </div>
                {userOrders.length === 0 ? (
                  <div className="text-center py-10">
                    <Package size={48} className="mx-auto text-zinc-200 mb-4" />
                    <p className="text-zinc-400">No recent orders found.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {userOrders.slice(0, 3).map(order => (
                      <div key={order.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center text-[#FF6600] shadow-sm">
                            <Box size={24} />
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900">{order.productName}</p>
                            <p className="text-xs text-zinc-400">{order.orderId}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-zinc-900">${order.totalPrice.toFixed(2)}</p>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${
                            order.status === 'delivered' ? 'bg-green-100 text-green-600' : 
                            order.status === 'shipped' ? 'bg-blue-100 text-blue-600' : 
                            order.status === 'cancelled' ? 'bg-red-100 text-red-600' : 
                            'bg-orange-100 text-orange-600'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      ) : view === 'orders' && user ? (
        <main className="mx-auto max-w-4xl px-4 py-12">
          <div className="flex items-center gap-4 mb-10">
            <button 
              onClick={() => setView('shop')}
              className="h-12 w-12 bg-white rounded-2xl flex items-center justify-center text-zinc-400 hover:text-[#FF6600] transition-all shadow-sm border border-zinc-100"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-3xl font-black text-zinc-900">My Orders</h1>
          </div>

          {userOrders.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] p-20 shadow-xl border border-zinc-100 text-center">
              <div className="h-24 w-24 bg-zinc-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-zinc-200">
                <Package size={48} />
              </div>
              <h2 className="text-2xl font-black text-zinc-900 mb-2">No Orders Yet</h2>
              <p className="text-zinc-500 mb-8">Start shopping and your orders will appear here.</p>
              <button 
                onClick={() => setView('shop')}
                className="bg-[#FF6600] text-white px-8 py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-100"
              >
                Explore Marketplace
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {userOrders.map(order => (
                <motion.div 
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-zinc-100 overflow-hidden relative"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                      <div className="h-20 w-20 bg-zinc-50 rounded-[1.5rem] flex items-center justify-center text-[#FF6600] shadow-inner">
                        <Box size={40} />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-xl font-black text-zinc-900">{order.productName}</h3>
                          <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                            order.status === 'delivered' ? 'bg-green-100 text-green-600' : 
                            order.status === 'shipped' ? 'bg-blue-100 text-blue-600' : 
                            order.status === 'cancelled' ? 'bg-red-100 text-red-600' : 
                            'bg-orange-100 text-orange-600'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400 font-medium mb-2">Order ID: <span className="text-zinc-600">{order.orderId}</span></p>
                        <div className="flex items-center gap-4 text-xs text-zinc-500 font-bold uppercase tracking-widest">
                          <span className="flex items-center gap-1.5"><Package size={14} /> Qty: {order.quantity}</span>
                          <span className="flex items-center gap-1.5"><CreditCard size={14} /> Total: ${order.totalPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Ordered On</p>
                      <p className="text-lg font-black text-zinc-900">
                        {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : new Date().toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Visual Tracking Bar */}
                  <div className="mt-8 pt-8 border-t border-zinc-50">
                    <div className="relative flex justify-between items-center max-w-2xl mx-auto">
                      {/* Progress Line */}
                      <div className="absolute left-0 right-0 h-1 bg-zinc-100 top-1/2 -translate-y-1/2 z-0" />
                      <div 
                        className="absolute left-0 h-1 bg-[#FF6600] top-1/2 -translate-y-1/2 z-0 transition-all duration-1000" 
                        style={{ 
                          width: order.status === 'pending' ? '0%' : 
                                 order.status === 'shipped' ? '50%' : 
                                 order.status === 'delivered' ? '100%' : '0%',
                          opacity: order.status === 'cancelled' ? 0 : 1
                        }}
                      />

                      {/* Steps */}
                      {[
                        { id: 'pending', label: 'Pending', icon: Package },
                        { id: 'shipped', label: 'Shipped', icon: TrendingUp },
                        { id: 'delivered', label: 'Delivered', icon: CheckCircle }
                      ].map((step, idx) => {
                        const isCompleted = (order.status === 'shipped' && step.id === 'pending') || 
                                            (order.status === 'delivered' && (step.id === 'pending' || step.id === 'shipped' || step.id === 'delivered'));
                        const isActive = order.status === step.id;
                        const isCancelled = order.status === 'cancelled';

                        return (
                          <div key={step.id} className="relative z-10 flex flex-col items-center gap-2">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                              isCancelled ? 'bg-zinc-100 text-zinc-400' :
                              isCompleted || isActive ? 'bg-[#FF6600] text-white shadow-lg shadow-orange-200 scale-110' : 
                              'bg-white border-2 border-zinc-100 text-zinc-300'
                            }`}>
                              <step.icon size={18} />
                            </div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${
                              isCancelled ? 'text-zinc-400' :
                              isCompleted || isActive ? 'text-[#FF6600]' : 'text-zinc-300'
                            }`}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {order.status === 'cancelled' && (
                      <div className="mt-4 text-center">
                        <span className="text-xs font-black text-red-500 uppercase tracking-widest bg-red-50 px-4 py-1.5 rounded-full">
                          Order Cancelled
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </main>
      ) : userProfile?.role !== 'admin' ? (
        <main className="mx-auto max-w-lg px-4 py-20">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2rem] p-8 shadow-xl border border-zinc-200 text-center"
          >
            <div className="flex flex-col items-center mb-8">
              <div className="h-16 w-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
                <ShieldCheck size={32} className="text-red-500" />
              </div>
              <h2 className="text-2xl font-bold">Admin Access Required</h2>
              <p className="text-zinc-500 text-sm mt-1">Please sign in with an administrator account to access the Supplier Center.</p>
            </div>
            
            <div className="flex flex-col gap-3 w-full">
              <button 
                onClick={() => setIsAdminLoginModalOpen(true)}
                className="w-full bg-[#FF6600] text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-100"
              >
                Administrator Login
              </button>
            </div>
            <button 
              onClick={() => setView('shop')}
              className="w-full mt-4 text-zinc-500 font-bold hover:text-zinc-700 transition-colors"
            >
              Back to Shop
            </button>
          </motion.div>
        </main>
      ) : (
        <main className="mx-auto max-w-6xl px-4 py-6 space-y-8 pb-20">
          {/* Admin Header & Stats */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-zinc-900">Supplier Center</h1>
              <p className="text-zinc-500 font-medium">Manage your marketplace, orders, and users</p>
            </div>
            <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-zinc-100 overflow-x-auto no-scrollbar max-w-full">
              <button 
                onClick={() => setAdminSubView('dashboard')}
                className={`px-4 sm:px-6 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${adminSubView === 'dashboard' ? 'bg-[#FF6600] text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-50'}`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => setAdminSubView('products')}
                className={`px-4 sm:px-6 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${adminSubView === 'products' ? 'bg-[#FF6600] text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-50'}`}
              >
                Products
              </button>
              <button 
                onClick={() => setAdminSubView('orders')}
                className={`px-4 sm:px-6 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${adminSubView === 'orders' ? 'bg-[#FF6600] text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-50'}`}
              >
                Orders
              </button>
              <button 
                onClick={() => setAdminSubView('users')}
                className={`px-4 sm:px-6 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${adminSubView === 'users' ? 'bg-[#FF6600] text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-50'}`}
              >
                Users
              </button>
            </div>
          </div>

          {adminSubView === 'dashboard' && (
            <div className="space-y-8">
              {/* Stats Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 flex items-center gap-4">
                  <div className="h-12 w-12 bg-orange-50 rounded-xl flex items-center justify-center text-[#FF6600]">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Revenue</p>
                    <p className="text-lg font-black text-zinc-900">${adminFirestoreStats.totalRevenue.toFixed(2)}</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 flex items-center gap-4">
                  <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500">
                    <Package size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Orders</p>
                    <p className="text-lg font-black text-zinc-900">{adminFirestoreStats.totalOrders}</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 flex items-center gap-4">
                  <div className="h-12 w-12 bg-green-50 rounded-xl flex items-center justify-center text-green-500">
                    <Box size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Products</p>
                    <p className="text-lg font-black text-zinc-900">{adminStats.total}</p>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 flex items-center gap-4">
                  <div className="h-12 w-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-500">
                    <UserIcon size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Users</p>
                    <p className="text-lg font-black text-zinc-900">{adminFirestoreStats.totalUsers}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Order Volume Chart */}
                <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-black text-zinc-900">Order Volume (7 Days)</h3>
                    <TrendingUp size={18} className="text-zinc-400" />
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={adminFirestoreStats.dailyOrders}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#999' }}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#999' }}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontWeight: 700 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="count" 
                          stroke="#FF6600" 
                          strokeWidth={3} 
                          dot={{ r: 4, fill: '#FF6600', strokeWidth: 2, stroke: '#fff' }}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top Categories Chart */}
                <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-black text-zinc-900">Top Categories</h3>
                    <BarChart3 size={18} className="text-zinc-400" />
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={adminFirestoreStats.topCategories} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                        <XAxis type="number" hide />
                        <YAxis 
                          dataKey="category" 
                          type="category" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#666' }}
                          width={80}
                        />
                        <Tooltip 
                          cursor={{ fill: '#f8f8f8' }}
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontWeight: 700 }}
                        />
                        <Bar 
                          dataKey="total_sold" 
                          fill="#FF6600" 
                          radius={[0, 8, 8, 0]}
                          barSize={20}
                        >
                          {adminFirestoreStats.topCategories.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#FF6600', '#FF8533', '#FFA366', '#FFC299', '#FFE0CC'][index % 5]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Revenue Distribution */}
              <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-black text-zinc-900">Revenue Distribution</h3>
                  <BarChart3 size={18} className="text-zinc-400" />
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={adminFirestoreStats.topCategories}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="total_sold"
                        nameKey="category"
                      >
                        {adminFirestoreStats.topCategories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#FF6600', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'][index % 5]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontWeight: 700 }}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={36}
                        formatter={(value) => <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {adminSubView === 'products' && (
            <div className="space-y-8">
              {/* Top Categories */}
              {adminFirestoreStats.topCategories.length > 0 && (
                <section className="bg-white rounded-[2rem] p-8 shadow-md border border-zinc-100">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Star className="text-orange-400" /> Top Selling Categories
                  </h3>
                  <div className="space-y-4">
                    {adminFirestoreStats.topCategories.map((cat, idx) => (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="w-32 text-sm font-bold text-zinc-600 truncate">{cat.category}</div>
                        <div className="flex-1 h-3 bg-zinc-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(cat.total_sold / adminFirestoreStats.topCategories[0].total_sold) * 100}%` }}
                            className="h-full bg-[#FF6600]"
                          />
                        </div>
                        <div className="w-12 text-right text-sm font-black text-zinc-900">{cat.total_sold}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Add New Product Form */}
              <section className="bg-white rounded-[2rem] p-8 shadow-md border border-zinc-100">
                <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
                  <Plus className="text-[#FF6600]" /> Add New Product
                </h2>
                <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Product Name</label>
                    <input 
                      required
                      type="text" 
                      placeholder="e.g., High Quality Cotton T-Shirts"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                      value={newProduct.name}
                      onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Price ($ per unit)</label>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      placeholder="Enter unit price"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                      value={newProduct.price || ''}
                      onChange={e => setNewProduct({...newProduct, price: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Category</label>
                    <select 
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                      value={newProduct.category}
                      onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                    >
                      {CATEGORIES.filter(c => c !== "All Categories").map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Shop Name</label>
                    <input 
                      required
                      type="text" 
                      placeholder="Your business name"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                      value={newProduct.shopName}
                      onChange={e => setNewProduct({...newProduct, shopName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Minimum Order (MOQ)</label>
                    <input 
                      type="text" 
                      placeholder="e.g., 10 pieces, 1 container"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                      value={newProduct.moq}
                      onChange={e => setNewProduct({...newProduct, moq: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Location</label>
                    <input 
                      type="text" 
                      placeholder="e.g., Sodo Market, Ethiopia"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                      value={newProduct.location}
                      onChange={e => setNewProduct({...newProduct, location: e.target.value})}
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2 py-2">
                    <input 
                      type="checkbox" 
                      id="isFeatured"
                      className="w-5 h-5 accent-[#FF6600]"
                      checked={newProduct.isFeatured}
                      onChange={e => setNewProduct({...newProduct, isFeatured: e.target.checked})}
                    />
                    <label htmlFor="isFeatured" className="text-sm font-bold text-zinc-700 cursor-pointer">Mark as Featured Product</label>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Description</label>
                    <textarea 
                      required
                      rows={3}
                      placeholder="Detailed product description..."
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all resize-none"
                      value={newProduct.description}
                      onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                    />
                  </div>
                  <div className="md:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Technical Specifications</label>
                      <button 
                        type="button"
                        onClick={() => addSpecRow(false)}
                        className="text-[10px] font-black text-[#FF6600] uppercase tracking-widest flex items-center gap-1 hover:underline"
                      >
                        <Plus size={12} /> Add Specification
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {parseSpecs(newProduct.technical_specs).map((spec, idx) => (
                        <div key={idx} className="flex gap-3 items-start">
                          <div className="flex-1 relative">
                            <select
                              className="absolute inset-0 opacity-0 cursor-pointer"
                              onChange={(e) => handleSpecChange(idx, 'key', e.target.value, false)}
                              value=""
                            >
                              <option value="" disabled>Common Keys</option>
                              {COMMON_SPEC_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                            <input 
                              type="text"
                              placeholder="Key (e.g. Material)"
                              value={spec.key}
                              onChange={(e) => handleSpecChange(idx, 'key', e.target.value, false)}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 text-sm focus:outline-none focus:border-[#FF6600] transition-all"
                            />
                          </div>
                          <div className="flex-[2]">
                            <input 
                              type="text"
                              placeholder="Value (e.g. 100% Cotton)"
                              value={spec.value}
                              onChange={(e) => handleSpecChange(idx, 'value', e.target.value, false)}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 text-sm focus:outline-none focus:border-[#FF6600] transition-all"
                            />
                          </div>
                          <button 
                            type="button"
                            onClick={() => removeSpecRow(idx, false)}
                            className="p-3 text-zinc-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                      {parseSpecs(newProduct.technical_specs).length === 0 && (
                        <div className="text-center py-6 border-2 border-dashed border-zinc-100 rounded-2xl">
                          <p className="text-zinc-400 text-xs font-medium">No specifications added yet. Add details like Material, Weight, or Dimensions.</p>
                        </div>
                      )}
                    </div>
                  </div>
                    <div className="md:col-span-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Image URL</label>
                        {newProduct.image && (
                          <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider">Preview Active</span>
                        )}
                      </div>
                      <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                          <input 
                            required
                            type="url" 
                            placeholder="https://images.unsplash.com/..."
                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all pr-32"
                            value={newProduct.image}
                            onChange={e => setNewProduct({...newProduct, image: e.target.value})}
                          />
                          <button
                            type="button"
                            onClick={() => generateProductImage(newProduct.description, false)}
                            disabled={isGeneratingImage || !newProduct.description}
                            className="absolute right-2 top-1.5 bottom-1.5 px-3 bg-orange-50 text-[#FF6600] rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-orange-100 transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {isGeneratingImage ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            {isGeneratingImage ? 'Generating...' : 'AI Generate'}
                          </button>
                        </div>
                        {newProduct.image && (
                          <div className="w-full md:w-24 h-24 rounded-xl overflow-hidden border border-zinc-200 shrink-0">
                            <SmartImage src={newProduct.image} alt="Preview" size="100/100" lowData={lowDataMode} />
                          </div>
                        )}
                      </div>
                    </div>
                  
                  <div className="md:col-span-2">
                    <button 
                      type="submit"
                      className="w-full bg-[#FF6600] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-orange-100"
                    >
                      <Plus size={20} />
                      Publish Product
                    </button>
                  </div>
                </form>
              </section>

              {/* Existing Products List */}
              <section className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 ml-2">
                  <h2 className="text-xl font-bold">Active Listings ({filteredAdminProducts.length})</h2>
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search name, category, or shop..."
                      className="w-full bg-white border border-zinc-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-[#FF6600] transition-all shadow-sm"
                      value={adminProductSearch}
                      onChange={e => setAdminProductSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {filteredAdminProducts.length === 0 ? (
                    <div className="bg-white p-12 rounded-[2rem] border border-zinc-100 text-center">
                      <p className="text-zinc-500 font-medium">No products found matching your search.</p>
                    </div>
                  ) : (
                    filteredAdminProducts.map((product) => (
                      <div key={product.id} className="bg-white p-4 rounded-2xl flex items-center gap-4 border border-zinc-100 shadow-sm">
                        <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0 border border-zinc-100">
                          <SmartImage src={product.image} alt={product.name} size="100/100" lowData={lowDataMode} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold truncate text-sm">{product.name}</h3>
                          <div className="flex gap-2 mt-1">
                            <span className="text-[10px] bg-zinc-100 px-2 py-0.5 rounded font-bold text-zinc-500">{product.category}</span>
                            <span className="text-[10px] bg-orange-50 px-2 py-0.5 rounded font-bold text-[#FF6600]">MOQ: {product.moq}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => toggleFeatured(product.id, !!product.isFeatured)}
                            className={`p-2 rounded-xl transition-all ${product.isFeatured ? 'text-orange-500 bg-orange-50' : 'text-zinc-300 hover:text-zinc-400'}`}
                            title={product.isFeatured ? "Unfeature" : "Feature this product"}
                          >
                            <Star size={20} fill={product.isFeatured ? "currentColor" : "none"} />
                          </button>
                          <div className="text-right mr-4 min-w-[80px]">
                            <p className="text-[#333] font-black">${product.price.toFixed(2)}</p>
                          </div>
                          <button 
                            onClick={() => handleEditProduct(product)}
                            className="p-3 text-zinc-500 hover:bg-zinc-50 rounded-xl transition-colors"
                            title="Edit product"
                          >
                            <Settings size={20} />
                          </button>
                          <button 
                            onClick={() => handleDeleteProduct(product.id)}
                            className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                            title="Delete product"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}

          {adminSubView === 'orders' && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold ml-2">All Marketplace Orders ({allOrders.length})</h2>
              <div className="grid grid-cols-1 gap-4">
                {allOrders.map((order) => {
                  const orderUser = allUsers.find(u => u.uid === order.userId);
                  return (
                    <div key={order.id} className="bg-white p-6 rounded-[2rem] border border-zinc-100 shadow-md">
                      <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div className="flex gap-4">
                          <div className="h-16 w-16 bg-zinc-50 rounded-2xl flex items-center justify-center text-[#FF6600]">
                            <Package size={32} />
                          </div>
                          <div>
                            <h3 className="font-black text-lg">{order.productName}</h3>
                            <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Order ID: {order.orderId}</p>
                            <div className="mt-2 flex flex-wrap gap-4 text-sm font-medium text-zinc-600">
                              <span className="flex items-center gap-1"><UserIcon size={14} /> {orderUser?.displayName || 'Unknown User'}</span>
                              <span className="flex items-center gap-1"><Mail size={14} /> {orderUser?.email || 'No Email'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Status:</span>
                            <select 
                              value={order.status}
                              onChange={(e) => handleUpdateOrderStatus(order.id!, e.target.value as any)}
                              className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest focus:outline-none border-none cursor-pointer ${
                                order.status === 'delivered' ? 'bg-green-100 text-green-600' : 
                                order.status === 'shipped' ? 'bg-blue-100 text-blue-600' : 
                                order.status === 'cancelled' ? 'bg-red-100 text-red-600' : 
                                'bg-orange-100 text-orange-600'
                              }`}
                            >
                              <option value="pending">Pending</option>
                              <option value="shipped">Shipped</option>
                              <option value="delivered">Delivered</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-black text-zinc-900">${order.totalPrice.toFixed(2)}</p>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Qty: {order.quantity}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {adminSubView === 'users' && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold ml-2">Marketplace Users ({allUsers.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allUsers.map((u) => (
                  <div key={u.uid} className="bg-white p-6 rounded-[2rem] border border-zinc-100 shadow-md flex items-center gap-4">
                    <SmartImage 
                      src={u.photoURL} 
                      alt={u.displayName} 
                      className="h-16 w-16 rounded-2xl border-2 border-zinc-50"
                      size="100/100"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black truncate">{u.displayName}</h3>
                        <select 
                          value={u.role}
                          onChange={(e) => handleUpdateUserRole(u.uid, e.target.value as any)}
                          className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest focus:outline-none border-none cursor-pointer ${u.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}
                          disabled={u.email === 'abduaragaw1996@gmail.com'}
                        >
                          <option value="user">User</option>
                          {u.role === 'admin' && <option value="admin">Admin</option>}
                        </select>
                      </div>
                      <p className="text-sm text-zinc-500 truncate">{u.email}</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Joined: {new Date(u.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      )}
      {/* Cart Drawer */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="text-[#FF6600]" />
                  <h2 className="text-xl font-black text-zinc-900">Your Cart</h2>
                  <span className="bg-zinc-100 text-zinc-500 text-xs font-bold px-2 py-1 rounded-full">
                    {cartTotalItems} items
                  </span>
                </div>
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <CloseIcon size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="bg-zinc-50 p-6 rounded-full mb-4">
                      <ShoppingCart size={48} className="text-zinc-200" />
                    </div>
                    <h3 className="text-lg font-bold text-zinc-900 mb-2">Your cart is empty</h3>
                    <p className="text-zinc-500 max-w-[240px]">Looks like you haven't added anything to your cart yet.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {cart.map((item) => (
                      <div key={item.id} className="flex gap-4">
                        <div className="h-20 w-20 rounded-xl overflow-hidden bg-zinc-50 border border-zinc-100 shrink-0">
                          <SmartImage src={item.image} alt={item.name} className="w-full h-full" size="200/200" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-zinc-900 truncate">{item.name}</h4>
                          <p className="text-[#FF6600] font-black mb-2">${item.price.toFixed(2)}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center bg-zinc-100 rounded-lg p-1">
                              <button 
                                onClick={() => updateQuantity(item.id, -1)}
                                className="p-1 hover:bg-white rounded-md transition-colors"
                              >
                                <Minus size={14} />
                              </button>
                              <span className="w-8 text-center text-xs font-bold">{item.quantity}</span>
                              <button 
                                onClick={() => updateQuantity(item.id, 1)}
                                className="p-1 hover:bg-white rounded-md transition-colors"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                            <button 
                              onClick={() => removeFromCart(item.id)}
                              className="text-xs text-zinc-400 hover:text-red-500 font-bold uppercase tracking-wider"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-zinc-500 font-medium">Subtotal</span>
                    <span className="text-2xl font-black text-zinc-900">${cartTotalPrice.toFixed(2)}</span>
                  </div>
                  <button 
                    onClick={() => handleCheckout()}
                    className="w-full bg-[#FF6600] hover:bg-[#E65C00] text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-100 text-lg"
                  >
                    Checkout via Telegram
                  </button>
                  <a 
                    href={`tel:${SUPPORT_PHONE}`}
                    className="w-full flex items-center justify-center gap-2 bg-white border-2 border-zinc-200 hover:border-[#FF6600] text-zinc-600 hover:text-[#FF6600] py-3 rounded-2xl font-bold transition-all active:scale-95 text-sm"
                  >
                    <Phone size={16} />
                    Call for Alternative Support
                  </a>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Buyer Information Modal */}
      <AnimatePresence>
        {showBuyerForm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {setShowBuyerForm(false); setPendingAction(null);}}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-zinc-100"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-black text-zinc-900">Your Information</h3>
                  <p className="text-zinc-500 text-sm">Please provide your details for the seller</p>
                </div>
                <button 
                  onClick={() => {setShowBuyerForm(false); setPendingAction(null);}}
                  className="h-10 w-10 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <CloseIcon size={20} />
                </button>
              </div>

              <form onSubmit={handleBuyerFormSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Full Name</label>
                  <input 
                    required
                    type="text" 
                    placeholder="Enter your full name"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                    value={buyerInfo.name}
                    onChange={e => setBuyerInfo({...buyerInfo, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Phone Number</label>
                  <input 
                    required
                    type="tel" 
                    placeholder="e.g., 0911223344"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                    value={buyerInfo.phone}
                    onChange={e => setBuyerInfo({...buyerInfo, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-zinc-500 text-xs font-bold uppercase ml-1">Delivery Location</label>
                  <input 
                    required
                    type="text" 
                    placeholder="e.g., Sodo, Near Main Square"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                    value={buyerInfo.location}
                    onChange={e => setBuyerInfo({...buyerInfo, location: e.target.value})}
                  />
                </div>
                
                <button 
                  type="submit"
                  className="w-full bg-[#FF6600] text-white py-5 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-100 text-lg flex items-center justify-center gap-3"
                >
                  Continue to Telegram
                  <Send size={20} fill="currentColor" />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Telegram Confirmation Modal */}
      <AnimatePresence>
        {showTelegramConfirmation && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {setShowTelegramConfirmation(false); setTelegramAction(null);}}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl border border-zinc-100"
            >
              <div className="bg-blue-50 w-16 h-16 rounded-2xl flex items-center justify-center text-blue-500 mb-6 mx-auto">
                <Send size={32} fill="currentColor" />
              </div>
              <h3 className="text-xl font-black text-center mb-2">Open Telegram?</h3>
              <p className="text-zinc-500 text-center mb-8">
                You are about to be redirected to Telegram to contact the seller. Do you want to continue?
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={confirmTelegramAction}
                  className="w-full bg-[#FF6600] hover:bg-[#E65C00] text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-100"
                >
                  Yes, Open Telegram
                </button>
                <button 
                  onClick={() => {setShowTelegramConfirmation(false); setTelegramAction(null);}}
                  className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 py-4 rounded-2xl font-bold transition-all active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {productToDelete !== null && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setProductToDelete(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-zinc-100"
            >
              <div className="bg-red-50 w-16 h-16 rounded-2xl flex items-center justify-center text-red-500 mb-6 mx-auto">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black text-center mb-2">Delete Product?</h3>
              <p className="text-zinc-500 text-center mb-8">This action cannot be undone. The product will be removed from the marketplace and all carts.</p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={confirmDelete}
                  className="w-full bg-red-500 hover:bg-red-600 text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-red-100"
                >
                  Yes, Delete Product
                </button>
                <button 
                  onClick={() => setProductToDelete(null)}
                  className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 py-4 rounded-2xl font-bold transition-all active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* AI Assistant Floating Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsAssistantOpen(true)}
        className="fixed bottom-8 right-8 z-[100] bg-gradient-to-br from-[#FF6600] to-[#FF9900] text-white p-4 rounded-full shadow-2xl shadow-orange-200 flex items-center justify-center group"
      >
        <Sparkles size={24} className="group-hover:rotate-12 transition-transform" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs group-hover:ml-2 transition-all duration-500 whitespace-nowrap font-bold text-sm">
          Shopping Assistant
        </span>
      </motion.button>

      {/* AI Assistant Chat Window */}
      <AnimatePresence>
        {isAssistantOpen && (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-end sm:p-8 pointer-events-none">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto"
              onClick={() => setIsAssistantOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="relative bg-white w-full sm:w-[450px] h-[80vh] sm:h-[600px] sm:rounded-[2.5rem] shadow-2xl border border-zinc-100 flex flex-col overflow-hidden pointer-events-auto"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-[#FF6600] to-[#FF9900] p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-xl">
                    <Bot size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg">AB Assistant</h3>
                    <div className="flex items-center gap-1.5 text-[10px] opacity-80 uppercase tracking-widest font-bold">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                      Thinking Mode Active
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAssistantOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <CloseIcon size={20} />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50">
                {assistantMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-8">
                    <div className="bg-orange-50 p-4 rounded-3xl text-[#FF6600]">
                      <Sparkles size={40} />
                    </div>
                    <h4 className="font-bold text-zinc-800">How can I help you today?</h4>
                    <p className="text-sm text-zinc-500">Ask me about products, compare prices, or get recommendations for your next purchase in AB.</p>
                    <div className="grid grid-cols-1 gap-2 w-full pt-4">
                      {[
                        "What are the best electronics?",
                        "Compare the cheapest products",
                        "Help me find a gift under $50"
                      ].map(suggestion => (
                        <button 
                          key={suggestion}
                          onClick={() => {
                            setAssistantInput(suggestion);
                            // We need to trigger the send manually or just set input
                          }}
                          className="text-xs bg-white border border-zinc-100 p-3 rounded-xl text-zinc-600 hover:border-[#FF6600] hover:text-[#FF6600] transition-all text-left"
                        >
                          "{suggestion}"
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {assistantMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${
                      msg.role === 'user' 
                      ? 'bg-[#FF6600] text-white rounded-tr-none shadow-md shadow-orange-100' 
                      : 'bg-white border border-zinc-100 text-zinc-800 rounded-tl-none shadow-sm'
                    }`}>
                      <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-inherit">
                        <Markdown>
                          {msg.content}
                        </Markdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isAssistantThinking && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-zinc-100 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-zinc-400 font-medium italic">Thinking deeply...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 bg-white border-t border-zinc-100">
                <form onSubmit={handleAssistantSend} className="relative">
                  <input 
                    type="text" 
                    value={assistantInput}
                    onChange={(e) => setAssistantInput(e.target.value)}
                    placeholder="Ask anything..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-4 pr-14 text-sm focus:outline-none focus:border-[#FF6600] transition-all"
                  />
                  <button 
                    type="submit"
                    disabled={!assistantInput.trim() || isAssistantThinking}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-[#FF6600] text-white rounded-xl flex items-center justify-center disabled:opacity-50 disabled:scale-95 transition-all active:scale-90 shadow-lg shadow-orange-100"
                  >
                    <Send size={18} fill="currentColor" />
                  </button>
                </form>
                <p className="text-[10px] text-center text-zinc-400 mt-3 uppercase tracking-widest font-bold">
                  Powered by Gemini 3.1 Pro
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAuthModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 sm:p-10">
                <div className="flex flex-col items-center mb-8">
                  <div className="h-16 w-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
                    {authMode === 'login' ? <LogIn size={32} className="text-[#FF6600]" /> : <UserPlus size={32} className="text-[#FF6600]" />}
                  </div>
                  <h2 className="text-2xl font-black text-zinc-900">
                    {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
                  </h2>
                  <p className="text-zinc-500 text-sm mt-1">
                    {authMode === 'login' ? 'Sign in to manage your orders' : 'Join AB Marketplace today'}
                  </p>
                </div>

                {authError && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm">
                    <AlertCircle size={18} />
                    <p>{authError}</p>
                  </div>
                )}

                {authSuccess && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3 text-green-600 text-sm">
                    <ShieldCheck size={18} />
                    <p>{authSuccess}</p>
                  </div>
                )}

                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  {authMode === 'register' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Full Name</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <UserIcon size={18} className="text-zinc-400" />
                        </div>
                        <input 
                          type="text"
                          required
                          value={authForm.displayName}
                          onChange={e => setAuthForm({ ...authForm, displayName: e.target.value })}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                          placeholder="John Doe"
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail size={18} className="text-zinc-400" />
                      </div>
                      <input 
                        type="email"
                        required
                        value={authForm.email}
                        onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                        placeholder="name@example.com"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock size={18} className="text-zinc-400" />
                      </div>
                      <input 
                        type="password"
                        required
                        value={authForm.password}
                        onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                        placeholder="••••••••"
                      />
                    </div>
                    {authMode === 'login' && (
                      <div className="flex justify-end mt-1">
                        <button 
                          type="button"
                          onClick={handleForgotPassword}
                          className="text-[10px] font-bold text-zinc-400 hover:text-[#FF6600] uppercase tracking-widest transition-colors"
                        >
                          Forgot Password?
                        </button>
                      </div>
                    )}
                  </div>

                  <button 
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full bg-[#FF6600] text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-100 disabled:opacity-50 disabled:scale-100 mt-4 flex items-center justify-center gap-2"
                  >
                    {isAuthLoading && <Loader2 className="animate-spin" size={20} />}
                    {isAuthLoading ? 'Please wait...' : (authMode === 'login' ? 'Sign In' : 'Create Account')}
                  </button>
                </form>

                <div className="mt-6">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-zinc-100"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-4 text-zinc-400 font-bold tracking-widest">Or continue with</span>
                    </div>
                  </div>

                  <button
                    onClick={handleGoogleLogin}
                    disabled={isAuthLoading}
                    className="mt-6 w-full bg-white border border-zinc-200 text-zinc-700 py-4 rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-3 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Google
                  </button>
                </div>

                <div className="mt-8 text-center">
                  <button 
                    onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                    className="text-sm font-bold text-[#FF6600] hover:underline"
                  >
                    {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Product Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[32px] overflow-hidden shadow-2xl relative max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-orange-50 rounded-xl flex items-center justify-center">
                    <Settings size={20} className="text-[#FF6600]" />
                  </div>
                  <h2 className="text-xl font-bold">Edit Product</h2>
                </div>
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-zinc-400" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto">
                <form onSubmit={handleUpdateProduct} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Product Name</label>
                      <input 
                        type="text"
                        required
                        value={editingProduct.name}
                        onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 px-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                        placeholder="e.g., Premium Leather Shoes"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Price ($)</label>
                      <input 
                        type="number"
                        step="0.01"
                        required
                        value={editingProduct.price}
                        onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) })}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 px-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Category</label>
                      <select 
                        value={editingProduct.category}
                        onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 px-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all appearance-none"
                      >
                        {["Electronics", "Fashion", "Home", "Agriculture", "Industrial", "General"].map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">MOQ</label>
                      <input 
                        type="text"
                        required
                        value={editingProduct.moq}
                        onChange={e => setEditingProduct({ ...editingProduct, moq: e.target.value })}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 px-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                        placeholder="e.g., 10 pieces"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Image URL</label>
                      <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                          <input 
                            type="url"
                            required
                            value={editingProduct.image}
                            onChange={e => setEditingProduct({ ...editingProduct, image: e.target.value })}
                            className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 px-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all pr-32"
                            placeholder="https://example.com/image.jpg"
                          />
                          <button
                            type="button"
                            onClick={() => generateProductImage(editingProduct.description, true)}
                            disabled={isGeneratingImage || !editingProduct.description}
                            className="absolute right-2 top-2 bottom-2 px-3 bg-orange-50 text-[#FF6600] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-100 transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {isGeneratingImage ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            {isGeneratingImage ? 'Generating...' : 'AI Generate'}
                          </button>
                        </div>
                        {editingProduct.image && (
                          <div className="w-full md:w-24 h-24 rounded-2xl overflow-hidden border border-zinc-200 shrink-0">
                            <SmartImage src={editingProduct.image} alt="Preview" size="100/100" lowData={lowDataMode} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Description</label>
                      <textarea 
                        required
                        rows={4}
                        value={editingProduct.description}
                        onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 px-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all resize-none"
                        placeholder="Describe the product details..."
                      />
                    </div>
                    <div className="space-y-4 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Technical Specifications</label>
                        <button 
                          type="button"
                          onClick={() => addSpecRow(true)}
                          className="text-[10px] font-black text-[#FF6600] uppercase tracking-widest flex items-center gap-1 hover:underline"
                        >
                          <Plus size={12} /> Add Specification
                        </button>
                      </div>

                      <div className="space-y-3">
                        {parseSpecs(editingProduct.technical_specs).map((spec, idx) => (
                          <div key={idx} className="flex gap-3 items-start">
                            <div className="flex-1 relative">
                              <select
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={(e) => handleSpecChange(idx, 'key', e.target.value, true)}
                                value=""
                              >
                                <option value="" disabled>Common Keys</option>
                                {COMMON_SPEC_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                              </select>
                              <input 
                                type="text"
                                placeholder="Key"
                                value={spec.key}
                                onChange={(e) => handleSpecChange(idx, 'key', e.target.value, true)}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 text-sm focus:outline-none focus:border-[#FF6600] transition-all"
                              />
                            </div>
                            <div className="flex-[2]">
                              <input 
                                type="text"
                                placeholder="Value"
                                value={spec.value}
                                onChange={(e) => handleSpecChange(idx, 'value', e.target.value, true)}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-800 text-sm focus:outline-none focus:border-[#FF6600] transition-all"
                              />
                            </div>
                            <button 
                              type="button"
                              onClick={() => removeSpecRow(idx, true)}
                              className="p-3 text-zinc-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))}
                        {parseSpecs(editingProduct.technical_specs).length === 0 && (
                          <div className="text-center py-6 border-2 border-dashed border-zinc-100 rounded-2xl">
                            <p className="text-zinc-400 text-xs font-medium">No specifications added yet.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="flex-1 bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 bg-[#FF6600] text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-100"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {isAdminLoginModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl relative"
            >
              <button 
                onClick={() => setIsAdminLoginModalOpen(false)}
                className="absolute top-6 right-6 p-2 hover:bg-zinc-100 rounded-full transition-colors z-10"
              >
                <X size={20} className="text-zinc-400" />
              </button>

              <div className="p-8 md:p-12">
                <div className="flex flex-col items-center mb-8">
                  <div className="h-16 w-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
                    <ShieldCheck size={32} className="text-[#FF6600]" />
                  </div>
                  <h2 className="text-2xl font-bold">
                    {adminAuthMode === 'login' ? 'Administrator Login' : 'Register Administrator'}
                  </h2>
                  <p className="text-zinc-500 text-sm mt-1 text-center">
                    {adminAuthMode === 'login' 
                      ? 'Enter your credentials to access the secure admin panel.' 
                      : 'Create your administrator account to manage the marketplace.'}
                  </p>
                  {adminAuthMode === 'register' && (
                    <p className="text-[10px] text-zinc-400 mt-2 text-center max-w-[250px]">
                      Note: Use <span className="font-bold">abduaragaw1996@gmail.com</span> to automatically gain full administrative rights.
                    </p>
                  )}
                </div>

                <form onSubmit={handleAdminLogin} className="space-y-6">
                  {adminSessionError && (
                    <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-2">
                      <AlertCircle size={18} />
                      <div className="flex-1">
                        {adminSessionError}
                        {adminSessionError.includes('already registered') && (
                          <button 
                            type="button"
                            onClick={() => {
                              setAdminAuthMode('login');
                              setAdminSessionError('');
                            }}
                            className="ml-2 underline font-bold"
                          >
                            Switch to Sign In
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {forgotPasswordSuccess && (
                    <div className="bg-green-50 border border-green-100 text-green-600 px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-2">
                      <CheckCircle size={18} />
                      {forgotPasswordSuccess}
                    </div>
                  )}

                  {adminAuthMode === 'register' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Full Name</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <UserIcon size={18} className="text-zinc-400" />
                        </div>
                        <input 
                          type="text"
                          required
                          value={adminAuthForm.displayName}
                          onChange={e => setAdminAuthForm({ ...adminAuthForm, displayName: e.target.value })}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                          placeholder="Admin Name"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Admin Email</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail size={18} className="text-zinc-400" />
                      </div>
                      <input 
                        type="email"
                        required
                        value={adminAuthForm.email}
                        onChange={e => setAdminAuthForm({ ...adminAuthForm, email: e.target.value })}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-4 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                        placeholder="admin@ab.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock size={18} className="text-zinc-400" />
                      </div>
                      <input 
                        type={showAdminPassword ? "text" : "password"}
                        required
                        value={adminAuthForm.password}
                        onChange={e => setAdminAuthForm({ ...adminAuthForm, password: e.target.value })}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl py-4 pl-12 pr-12 text-zinc-800 focus:outline-none focus:border-[#FF6600] transition-all"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword(!showAdminPassword)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-zinc-400 hover:text-zinc-600 transition-colors"
                      >
                        {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {adminAuthMode === 'login' && (
                      <div className="flex justify-end px-1">
                        <button 
                          type="button"
                          onClick={handleAdminForgotPassword}
                          disabled={isForgotPasswordLoading}
                          className="text-xs font-bold text-zinc-400 hover:text-[#FF6600] transition-colors disabled:opacity-50"
                        >
                          {isForgotPasswordLoading ? 'Sending...' : 'Forgot Password?'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <button 
                      type="submit"
                      disabled={isAuthLoading}
                      className="w-full bg-[#FF6600] hover:bg-[#E65C00] text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-orange-100 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isAuthLoading ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        adminAuthMode === 'login' ? 'Sign In as Admin' : 'Register as Admin'
                      )}
                    </button>

                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-zinc-200"></div>
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-zinc-400 font-bold">Or continue with</span>
                      </div>
                    </div>

                    <button 
                      type="button"
                      onClick={handleAdminGoogleLogin}
                      disabled={isAuthLoading}
                      className="w-full bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 py-4 rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      <Globe size={20} className="text-zinc-400" />
                      Sign In with Google
                    </button>
                  </div>

                  <div className="text-center">
                    <button 
                      type="button"
                      onClick={() => setAdminAuthMode(adminAuthMode === 'login' ? 'register' : 'login')}
                      className="text-sm font-bold text-zinc-400 hover:text-[#FF6600] transition-colors"
                    >
                      {adminAuthMode === 'login' 
                        ? "Don't have an admin account? Register" 
                        : "Already have an admin account? Sign In"}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
