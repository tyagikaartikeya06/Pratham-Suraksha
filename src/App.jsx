import React, { useState, useEffect, useRef } from 'react';
import { Shield, Phone, MapPin, Users, Camera, Mic, Video, Watch, Settings, Home, Lock, Unlock, Battery, Wifi, WifiOff, X, Trash2, Save, Globe } from 'lucide-react';

// ===========================================
// 🟢 CONFIGURATION
// ===========================================
const API_BASE_URL = "https://pratham-backend-9q7v.onrender.com"; 

const BLE_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb'; 
const BLE_CHAR_UUID =    '0000ffe1-0000-1000-8000-00805f9b34fb';

export default function PrathamSuraksha() {
  const [activeTab, setActiveTab] = useState('home');
  const [isLocked, setIsLocked] = useState(true);
  const [tapCount, setTapCount] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState(null);
  
  // Settings
  const [saveLocally, setSaveLocally] = useState(true); 

  // User ID (Privacy)
  const [userId, setUserId] = useState(null);

  // Data States
  const [emergencyContacts, setEmergencyContacts] = useState([]); 
  
  // 🟢 STRICT LOCATION STATE (Default is 0,0 - No Fake IP)
  const [location, setLocation] = useState({ lat: 0, lng: 0, accuracy: 0 });
  const [locationName, setLocationName] = useState("Waiting for GPS...");
  const [gpsError, setGpsError] = useState(false);
  
  // System States
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [wearableConnected, setWearableConnected] = useState(false);
  const [parentalMode, setParentalMode] = useState(false);
  
  // Install State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  
  const tapTimerRef = useRef(null);
  const locationWatchId = useRef(null);
  const bluetoothDeviceRef = useRef(null);

  // ============================================
  // 0. USER ID & NETWORK
  // ============================================
  useEffect(() => {
    let storedId = localStorage.getItem('pratham_user_id');
    if (!storedId) {
        storedId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('pratham_user_id', storedId);
    }
    setUserId(storedId);

    const handleOnline = () => setOfflineMode(false);
    const handleOffline = () => setOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ============================================
  // 1. 📲 INSTALLATION LOGIC
  // ============================================
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    const handleAppInstalled = () => { setIsInstalled(true); setDeferredPrompt(null); };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    if (window.matchMedia('(display-mode: standalone)').matches) setIsInstalled(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) { alert("To install: Tap browser menu (⋮) -> 'Add to Home Screen'."); return; }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  // ============================================
  // 2. ⌚ BLUETOOTH WATCH CONNECTION
  // ============================================
  const connectWearable = async () => {
    if (!navigator.bluetooth) return alert("Bluetooth not supported in this browser.");
    try {
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE_UUID] }] });
      bluetoothDeviceRef.current = device;
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);
      const characteristic = await service.getCharacteristic(BLE_CHAR_UUID);
      await characteristic.startNotifications();
      
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const value = new TextDecoder().decode(event.target.value);
        if (value.startsWith("SOS:")) {
            const parts = value.split(":");
            const tapType = parseInt(parts[1]); 
            if (!isNaN(tapType) && tapType >= 1 && tapType <= 4) handleEmergencyTap(tapType, true); 
        } else if (value.includes("SOS")) {
            handleEmergencyTap(3, true); 
        }
      });
      setWearableConnected(true);
      alert("✅ Watch Connected!");
      device.addEventListener('gattserverdisconnected', () => setWearableConnected(false));
    } catch (error) { alert("Connection failed. Ensure Bluetooth is on."); }
  };

  // ============================================
  // 3. 🔋 SMART BATTERY & STRICT GPS LOGIC
  // ============================================
  useEffect(() => {
    if (userId) {
        fetch(`${API_BASE_URL}/api/contacts/list?userId=${userId}`) 
        .then(res => res.json())
        .then(data => { 
            if (Array.isArray(data)) {
                setEmergencyContacts(data); 
                localStorage.setItem('cached_contacts', JSON.stringify(data));
            }
        })
        .catch(err => {
            const cached = localStorage.getItem('cached_contacts');
            if (cached) setEmergencyContacts(JSON.parse(cached));
        });
    }
  }, [userId]);

  useEffect(() => {
    // 🟢 LOAD LAST KNOWN *REAL* GPS (Better than 0,0, but never IP)
    const savedLoc = localStorage.getItem('last_known_gps');
    if (savedLoc) {
        setLocation(JSON.parse(savedLoc));
        setLocationName("Last Known GPS");
    }

    if ('geolocation' in navigator) {
      // 🟢 FORCE HIGH ACCURACY - NO COMPROMISE
      const options = { 
          enableHighAccuracy: true, 
          timeout: 20000, 
          maximumAge: 0 // Do not use old cached position automatically
      };

      locationWatchId.current = navigator.geolocation.watchPosition(
        (position) => {
          setGpsError(false);
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;
          
          const newLoc = { lat, lng, accuracy, timestamp: Date.now() };
          setLocation(newLoc);
          
          // 🟢 Only save if accuracy is decent (e.g. under 100m) - Optional refinement
          localStorage.setItem('last_known_gps', JSON.stringify(newLoc));

          if (navigator.onLine) {
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
              .then(res => res.json())
              .then(data => {
                const name = `${data.address.suburb || ""}, ${data.address.city || ""}`;
                setLocationName(name);
              })
              .catch(() => setLocationName("GPS Active (Exact)"));
          } else {
            setLocationName(`OFFLINE: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
          }
        },
        (error) => {
            console.log('GPS Error:', error);
            setGpsError(true);
            
            // 🟢 STRICT ERROR MESSAGES
            if(error.code === 1) setLocationName("⚠️ Permission Denied");
            else if(error.code === 2) setLocationName("⚠️ GPS Signal Lost");
            else setLocationName("⚠️ GPS Timeout");
            
            // ❌ REMOVED: fetchIPLocation fallback. 
            // Now it stays on error or last known GPS.
        },
        options
      );
    } else { 
        setLocationName("❌ GPS Not Supported"); 
    }
    return () => { if (locationWatchId.current) navigator.geolocation.clearWatch(locationWatchId.current); };
  }, []);

  // ============================================
  // 4. 🛡️ SOS TAP LOGIC
  // ============================================
  const handleTap = () => {
    setTapCount(prev => {
      const count = prev + 1;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = setTimeout(() => { handleEmergencyTap(count, false); setTapCount(0); }, 1000);
      return count;
    });
  };

  const handleEmergencyTap = async (tapType, fromWatch = false) => {
    let title = "", contacts = [], dialNumber = "";
    
    if (tapType === 1) { title = "Police Help"; dialNumber = "100"; contacts = ["100"]; } 
    else if (tapType === 2) { title = "Medical Emergency"; dialNumber = "108"; contacts = ["108"]; } 
    else if (tapType === 3) {
      title = "Family Emergency";
      if (emergencyContacts.length === 0) { if (!fromWatch) alert("⚠️ Add contacts first!"); setActiveTab('contacts'); return; }
      contacts = emergencyContacts.map(c => c.phone);
    } 
    else if (tapType >= 4) {
        title = "CRITICAL: Water Rescue / Accident"; dialNumber = "108"; contacts = ["108"];
        if (emergencyContacts.length > 0) contacts = [...contacts, ...emergencyContacts.map(c => c.phone)];
    } else { return; }

    if (!fromWatch && tapType === 3 && !window.confirm(`⚠️ ${title}\n\nSend SOS & Start Recording?`)) return;

    if (!isRecording) {
        if (tapType >= 4) startAnonymousRecording('image', true);
        else startAnonymousRecording('video', true);
    }

    // 🟢 LOCATION CHECKER
    const finalizeAlert = (lat, lng) => {
        const finalLat = lat || location.lat;
        const finalLng = lng || location.lng;
        
        let mapLink = "";
        let locationText = "";

        // If strict 0,0 (GPS never worked), we must be honest.
        if (finalLat === 0 && finalLng === 0) {
            mapLink = "GPS_OFF_UNKNOWN_LOCATION";
            locationText = "GPS OFF / UNKNOWN";
        } else {
            mapLink = `https://www.google.com/maps?q=${finalLat},${finalLng}`;
            locationText = `${finalLat}, ${finalLng}`;
        }

        let msgBody = `SOS! ${title}. Loc: ${locationText}. Map: ${mapLink}`;
        if (tapType >= 4) msgBody = `CRITICAL WATER SOS! Image sent. Loc: ${locationText}. Map: ${mapLink}`;

        const sosData = { type: title, contacts, location: { lat: finalLat, lng: finalLng }, message: msgBody, time: new Date().toISOString() };

        if (navigator.onLine && !offlineMode) {
            fetch(`${API_BASE_URL}/api/sos`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sosData),
            }).then(() => { if(!fromWatch) alert(`✅ Alert Sent!`); })
              .catch(() => sendOfflineSMS(contacts, title, mapLink, finalLat, finalLng));
        }
        sendOfflineSMS(contacts, title, mapLink, finalLat, finalLng);
        if (dialNumber) setTimeout(() => { window.location.href = `tel:${dialNumber}`; }, 500);
    };

    // Try fresh GPS, fallback to State (Last Known GPS)
    navigator.geolocation.getCurrentPosition(
        (pos) => finalizeAlert(pos.coords.latitude, pos.coords.longitude),
        (err) => finalizeAlert(0, 0), // Use state fallback logic inside finalizeAlert
        { enableHighAccuracy: true, timeout: 3000, maximumAge: 0 }
    );
  };

  const sendOfflineSMS = (contacts, title, mapLink, lat, lng) => {
    const smsContacts = contacts.filter(c => c.length > 5); 
    if (smsContacts.length === 0) return;
    const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? ';' : ',';
    
    let body = "";
    // Honest Message if GPS is dead
    if (lat === 0 && lng === 0) {
        body = `SOS! ${title}. GPS SIGNAL LOST. Contact me immediately.`;
    } else {
        body = `SOS! ${title}. I am at Lat: ${lat}, Lng: ${lng}. Map: ${mapLink}`;
    }
    window.location.href = `sms:${smsContacts.join(separator)}?body=${encodeURIComponent(body)}`;
  };

  // ============================================
  // 5. 📹 RECORDING
  // ============================================
  const startAnonymousRecording = async (type, isAuto = false) => {
    if (!navigator.mediaDevices) { if(!isAuto) alert("Hardware not supported."); return; }
    try {
      setIsRecording(true);
      setRecordingType(type);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type !== 'audio' });
      
      if (type === 'image') {
          const track = stream.getVideoTracks()[0];
          const imageCapture = new ImageCapture(track);
          const bitmap = await imageCapture.grabFrame();
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width; canvas.height = bitmap.height;
          const context = canvas.getContext('2d');
          context.drawImage(bitmap, 0, 0);
          canvas.toBlob(async (blob) => {
               const file = new File([blob], "SOS_Evidence.png", { type: "image/png" });
               if (saveLocally) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.style.display = 'none'; a.href = url; a.download = `SOS_IMG_${Date.now()}.png`;
                    document.body.appendChild(a); a.click();
                    setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
               }
               if (navigator.canShare && navigator.canShare({ files: [file] })) {
                   try { await navigator.share({ files: [file], title: 'SOS Evidence', text: `CRITICAL EVIDENCE! Location: ${locationName}` }); } catch (err) {}
               }
               if (navigator.onLine) {
                   const reader = new FileReader(); reader.readAsDataURL(blob);
                   reader.onloadend = async () => {
                       await fetch(`${API_BASE_URL}/api/sos`, {
                           method: "POST", headers: { "Content-Type": "application/json" },
                           body: JSON.stringify({ type: `Evidence (Image)`, contacts: emergencyContacts.map(c => c.phone), location: location, mediaData: reader.result, mediaType: 'image/png' })
                       });
                       if(!isAuto) alert("✅ Image Uploaded!");
                   };
               }
               stream.getTracks().forEach(t => t.stop()); setIsRecording(false);
          }, 'image/png');
          return;
      }

      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: type === 'video' ? 'video/webm' : 'audio/webm' });
        const fileExt = type === 'video' ? 'webm' : 'webm';
        const file = new File([blob], `SOS_Recording.${fileExt}`, { type: type === 'video' ? 'video/webm' : 'audio/webm' });

        if (saveLocally) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.style.display = 'none'; a.href = url; a.download = `SOS_${type}_${Date.now()}.${fileExt}`;
            document.body.appendChild(a); a.click();
            setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); alert("✅ File Saved Locally!"); }, 100);
        }
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
             try { await navigator.share({ files: [file], title: 'SOS Recording', text: `EMERGENCY RECORDING! Location: ${locationName}` }); } catch (err) {}
        }
        if (navigator.onLine) {
          const reader = new FileReader(); reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            try {
              await fetch(`${API_BASE_URL}/api/sos`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: `Evidence (${type})`, contacts: emergencyContacts.map(c => c.phone), location: location, mediaData: reader.result, mediaType: type === 'video' ? 'video/webm' : 'audio/webm' })
              });
              if(!isAuto && !saveLocally) alert("✅ Uploaded to Cloud (Local Save OFF)");
              else if (!isAuto) alert("✅ Evidence Uploaded!");
            } catch (err) { console.log("Upload failed", err); }
          };
        }
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        setRecordingType(null);
      };
      mediaRecorder.start();
      setTimeout(() => { if (mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 30000); 
    } catch (err) { setIsRecording(false); }
  };

  // ============================================
  // 6. 📞 CONTACTS
  // ============================================
  const handleAddContact = async () => {
    if ('contacts' in navigator && 'ContactsManager' in window) {
      try {
        const selected = await navigator.contacts.select(['name', 'tel'], { multiple: true });
        const formatted = selected.map(c => ({ name: c.name[0], phone: c.tel[0], relation: 'Emergency' }));
        saveContactsToDB(formatted);
      } catch (err) { manualAddContact(); }
    } else { manualAddContact(); }
  };

  const manualAddContact = () => {
    const name = prompt("Name:");
    if (!name) return;
    if (!/^[a-zA-Z\s]+$/.test(name)) { alert("❌ Error: Name should contain Alphabets only."); return; }
    const phone = prompt("Phone:");
    if (!phone) return;
    if (!/^\d+$/.test(phone)) { alert("❌ Error: Phone should contain Numeric Digits only."); return; }
    saveContactsToDB([{ name, phone, relation: 'Emergency' }]);
  };

  const saveContactsToDB = (newContacts) => {
    const contactsWithId = newContacts.map(c => ({ ...c, userId: userId }));
    setEmergencyContacts(prev => [...prev, ...contactsWithId]);
    localStorage.setItem('cached_contacts', JSON.stringify([...emergencyContacts, ...contactsWithId]));
    contactsWithId.forEach(c => {
        fetch(`${API_BASE_URL}/api/contacts/add`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c)
        }).catch(e => console.log(e));
    });
  };

  const shareLocation = () => {
    if (emergencyContacts.length === 0) return alert("Add contacts first!");
    const mapLink = location.lat === 0 ? "UNKNOWN_GPS" : `https://www.google.com/maps?q=${location.lat},${location.lng}`;
    sendOfflineSMS(emergencyContacts.map(c => c.phone), "Location Share", mapLink, location.lat, location.lng);
  };

  // ============================================
  // RENDER UI
  // ============================================
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      
      {/* 🔵 HEADER */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 px-6 py-4 flex items-center gap-3 shadow-lg">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-white flex items-center justify-center p-0.5">
           <img 
             src="/pratham-suraksha-logo.png" 
             alt="Pratham Suraksha Logo" 
             className="w-full h-full object-cover rounded-full"
             onError={(e) => {e.target.style.display='none'}}
           />
           <Shield className="w-8 h-8 text-blue-800 absolute opacity-0" />
        </div>
        <div>
           <h1 className="text-white font-bold text-lg leading-tight">Pratham Suraksha</h1>
           <p className="text-blue-200 text-xs">Your Safety Companion</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-white">
          <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-full"><Battery className={`w-3 h-3 ${batteryLevel < 20 ? 'text-red-300' : ''}`} /><span className="text-[10px] font-bold">{batteryLevel}%</span></div>
          {offlineMode ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 pb-24 space-y-6">
        {activeTab === 'home' && (
          <div className="space-y-6">
            
            {/* 🔴 SOS SECTION */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <h2 className="text-gray-800 font-bold text-sm text-center">EMERGENCY TAP ZONE</h2>
                    <p className="text-gray-600 text-xs text-center mt-0.5">Tap 1x: Police | 2x: Amb | 3x: Parents | 4x: Water Rescue</p>
                </div>
                <div className="p-8 flex justify-center">
                    <button onClick={handleTap} className="relative group">
                        <div className="absolute inset-0 bg-red-500 rounded-3xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity animate-pulse"></div>
                        <div className="relative bg-gradient-to-br from-red-500 to-red-600 rounded-3xl px-12 py-10 shadow-2xl transform transition-transform active:scale-95 flex flex-col items-center gap-3">
                            <Shield className="w-16 h-16 text-white" />
                            <span className="text-white font-bold text-xl tracking-wide whitespace-nowrap">TAP HERE</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* 🔵 RECORDING SECTION */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5">
                <div className="flex items-center justify-center gap-2 text-gray-700 mb-4">
                     <Camera className="w-5 h-5 text-gray-500" />
                     <span className="font-bold text-sm">Anonymous Recording</span>
                </div>
                <div className="flex items-center justify-center gap-4">
                    <button onClick={() => startAnonymousRecording('audio')} disabled={isRecording} className={`flex flex-col items-center justify-center w-20 h-20 rounded-2xl shadow-lg transition-all ${isRecording ? 'bg-red-600' : 'bg-gradient-to-br from-blue-900 to-blue-800'}`}>
                        <Mic className="w-7 h-7 text-white mb-1" />
                        <span className="text-white text-xs font-medium">Audio</span>
                    </button>
                    <button onClick={() => startAnonymousRecording('image')} disabled={isRecording} className="flex flex-col items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl shadow-lg active:scale-95">
                        <Camera className="w-7 h-7 text-white mb-1" />
                        <span className="text-white text-xs font-medium">Image</span>
                    </button>
                    <button onClick={() => startAnonymousRecording('video')} disabled={isRecording} className="flex flex-col items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl shadow-lg active:scale-95">
                        <Video className="w-7 h-7 text-white mb-1" />
                        <span className="text-white text-xs font-medium">Video</span>
                    </button>
                </div>
            </div>

            {/* LOCATION CARD (🟢 UPDATED UI FOR GPS ERROR) */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-gray-800"><MapPin className="w-5 h-5 text-green-600" /> Live Location</h3>
                <div className={`p-4 rounded-xl mb-3 border ${gpsError ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                    <p className={`text-lg font-bold ${gpsError ? 'text-red-700' : 'text-blue-900'}`}>{locationName}</p>
                    <p className="text-sm font-mono mt-1 text-gray-600">Lat: {location.lat.toFixed(6)}, Lng: {location.lng.toFixed(6)}</p>
                </div>
                <button onClick={shareLocation} className="w-full py-3 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-xl font-bold text-sm shadow hover:opacity-90">SHARE LOCATION</button>
            </div>

            {/* WATCH CARD */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-gray-800"><Watch className="w-5 h-5 text-purple-600" /> Wearable</h3>
                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100 mb-3">
                    <span className="text-sm font-medium text-gray-600">Status</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${wearableConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{wearableConnected ? 'CONNECTED' : 'NOT LINKED'}</span>
                </div>
                <button onClick={connectWearable} className="w-full py-3 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-xl font-bold text-sm shadow hover:opacity-90">CONNECT WATCH</button>
            </div>
          </div>
        )}

        {/* CONTACTS TAB */}
        {activeTab === 'contacts' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
                <h2 className="text-gray-800 font-bold text-sm mb-4 flex items-center gap-2"><Users className="w-4 h-4" /> EMERGENCY CONTACTS</h2>
                {emergencyContacts.length === 0 ? <div className="text-center p-4 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300 mb-3">No contacts.</div> : emergencyContacts.map((c, i) => (<div key={i} className="p-4 bg-gray-50 border border-gray-100 rounded-xl mb-3 flex justify-between items-center"><div><p className="font-semibold text-lg text-gray-800">{c.name}</p><p className="text-sm text-gray-600">{c.phone}</p></div><Phone className="w-6 h-6 text-green-600" /></div>))}
                <button onClick={handleAddContact} className="w-full py-3 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-xl font-bold mt-2">+ Add Contact</button>
                <div className="mt-4 flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <span className="font-bold text-sm text-gray-700">Parental Mode</span>
                    <button onClick={() => setParentalMode(!parentalMode)} className={`px-4 py-1.5 rounded-full font-bold text-xs text-white ${parentalMode ? 'bg-green-500' : 'bg-gray-400'}`}>{parentalMode ? "ON" : "OFF"}</button>
                </div>
            </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4 space-y-4">
                <h2 className="text-gray-800 font-bold text-sm mb-2 flex items-center gap-2"><Settings className="w-4 h-4" /> SETTINGS</h2>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-full"><Save className="w-4 h-4 text-blue-600" /></div>
                        <div>
                            <span className="text-sm font-medium text-gray-800 block">Save Recordings Locally</span>
                            <span className="text-[10px] text-gray-500">Save video/audio to gallery</span>
                        </div>
                    </div>
                    <button onClick={() => setSaveLocally(!saveLocally)} className={`px-3 py-1 rounded-full text-xs font-bold text-white ${saveLocally ? 'bg-blue-600' : 'bg-gray-400'}`}>{saveLocally ? 'ON' : 'OFF'}</button>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-medium text-gray-700">Screen Lock</span>
                    <button onClick={() => setIsLocked(!isLocked)} className={`px-3 py-1 rounded-full text-xs font-bold text-white ${isLocked ? 'bg-blue-800' : 'bg-gray-400'}`}>{isLocked ? 'ON' : 'OFF'}</button>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-medium text-gray-700">Power Saver</span>
                    <button onClick={() => setLowPowerMode(!lowPowerMode)} className={`px-3 py-1 rounded-full text-xs font-bold text-white ${lowPowerMode ? 'bg-orange-500' : 'bg-gray-400'}`}>{lowPowerMode ? 'ON' : 'OFF'}</button>
                </div>

                {!isInstalled && deferredPrompt && <button onClick={handleInstallClick} className="w-full py-3 bg-gradient-to-r from-blue-900 to-blue-800 text-white rounded-xl font-bold text-sm">Install App</button>}
            </div>
        )}
      </div>

      {/* BOTTOM NAVIGATION */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 pb-safe z-50">
        <div className="flex items-center justify-around max-w-md mx-auto">
             <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'home' ? 'text-blue-900' : 'text-gray-400'}`}>
                 <Home className="w-6 h-6" />
                 <span className="text-xs font-medium">Home</span>
             </button>
             <button onClick={() => setActiveTab('contacts')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'contacts' ? 'text-blue-900' : 'text-gray-400'}`}>
                 <Users className="w-6 h-6" />
                 <span className="text-xs font-medium">Contacts</span>
             </button>
             <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'settings' ? 'text-blue-900' : 'text-gray-400'}`}>
                 <Settings className="w-6 h-6" />
                 <span className="text-xs font-medium">Settings</span>
             </button>
        </div>
      </div>

      {!isInstalled && deferredPrompt && activeTab === 'home' && (
        <div className="fixed bottom-20 left-4 right-4 bg-gradient-to-r from-blue-900 to-blue-800 text-white p-4 rounded-xl shadow-2xl flex items-center justify-between z-50 animate-bounce">
            <div><p className="font-bold">Install App</p><p className="text-xs opacity-90">Add to Home Screen</p></div>
            <div className="flex gap-2"><button onClick={() => setDeferredPrompt(null)} className="p-2"><X className="w-5 h-5" /></button><button onClick={handleInstallClick} className="bg-white text-blue-900 px-4 py-2 rounded-lg font-bold text-sm">Install</button></div>
        </div>
      )}
    </div>
  );
}