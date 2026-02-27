"use client";
import { useState } from "react";
import { useEffect } from "react";
import { nanoid } from "nanoid";

const ANIMALS = [
  "cat",
  "dog",
  "fox",
  "hamster",
  "lion",
  "tiger",
  "bear",
  "wolf",
  "rabbit",
  "monkey",
  "shark",
  "dolphin",
  "whale",
  "eagle",
  "owl",
  "panda",
  "koala",
  "giraffe",
  "zebra",
  "hippo"
];
const STORAGE_KEY = "chat_username";

const generateUsername = () => {
  const word = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  return `anonymous-${word}-${nanoid(5)}`
}

export default function Home() {
  const [username, setUsername] = useState("");
  
  useEffect(() => {
    const main = () => {
      
      let storedUsername = localStorage.getItem(STORAGE_KEY);
      if (!storedUsername) {
        storedUsername = generateUsername();
        localStorage.setItem(STORAGE_KEY, storedUsername);
      }
      
      setUsername(storedUsername);
    }
    
    main();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold bg-linear-to-r from-blue-500 to-green-600 bg-clip-text text-transparent tracking-tight">Private Messenger</h1>
          <p className="text-zinc-500 text-sm">A private self-destructing chat room.</p>
        </div>
        
        <div className="border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-md">
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="flex items-center text-zinc-500">
                Your identity
              </label>

              <div className="flex items-center gap-3">
                <div className="flex-1 bg-zinc-950 border border-zinc-800 p-3 text-sm text-zinc-400 font-mono">
                  {username}
                </div>
              </div>
            </div>
            
            <button className="w-full bg-zinc-100 text-black p-3 text-sm font-bold hover:text-black transition-colors mt-2 cursor-pointer disabled:opacity-50">
              Create Secure Room
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
