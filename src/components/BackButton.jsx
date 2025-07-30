// src/components/BackButton.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const BackButton = () => {
  const navigate = useNavigate();
  return (
    <div className="fixed top-2 right-2">
      <button onClick={() => navigate(-1)} className="p-2 text-gray-700 hover:text-gray-900">
        <ArrowLeft size={28} />
      </button>
    </div>
  );
};

export default BackButton;
