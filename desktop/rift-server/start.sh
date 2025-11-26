#!/bin/bash
# Rift Server Start Script for Linux/Mac
# Run this script to start the Rift server

echo "Starting Rift Server..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "ERROR: .env file not found!"
    echo "Please create .env file with:"
    echo "  RIFT_JWT_SECRET=your-secret-key-change-this-in-production"
    echo "  PORT=51001"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Failed to install dependencies!"
        exit 1
    fi
fi

# Start the server
echo "Starting server on port 51001..."
npm start

