import React from 'react';
import ReviewAnnotator from '../components/ReviewAnnotator';
import SearchBar from '../components/SearchBar';

export default function ReviewPage() {
  return (
    <div className="h-full flex flex-col bg-white min-h-0">
      <SearchBar onChange={() => {}} />
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <ReviewAnnotator />
      </div>
    </div>
  );
}

