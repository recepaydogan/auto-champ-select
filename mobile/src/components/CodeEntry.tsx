import React, { useRef, useEffect } from 'react';
import { View, TextInput, StyleSheet, Text } from 'react-native';

interface CodeEntryProps {
  value: string;
  onChange: (code: string) => void;
  onComplete: (code: string) => void;
  loading?: boolean;
}

export default function CodeEntry({ value, onChange, onComplete, loading = false }: CodeEntryProps) {
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    // Initialize inputs array
    if (inputs.current.length === 0) {
      inputs.current = Array(6).fill(null);
    }
  }, []);

  const handleChange = (index: number, text: string) => {
    // Only allow single digit
    if (text.length > 1) {
      text = text.slice(-1);
    }

    // Only allow digits
    if (text && !/^\d$/.test(text)) {
      return;
    }

    // Update value
    const newValue = value.split('');
    newValue[index] = text;
    // Only keep entered digits, don't pad with zeros
    const newCode = newValue.filter(c => c).join('');
    onChange(newCode);

    // Move to next input
    if (text && index < 5) {
      inputs.current[index + 1]?.focus();
    }

    // Check if complete - only trigger when all 6 digits are actually entered
    if (newCode.length === 6 && /^\d{6}$/.test(newCode)) {
      onComplete(newCode);
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !value[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Enter 6-digit code:</Text>
      <View style={styles.inputContainer}>
        {Array.from({ length: 6 }).map((_, index) => (
          <TextInput
            key={index}
            ref={(ref) => {
              inputs.current[index] = ref;
            }}
            style={styles.input}
            value={value[index] || ''}
            editable={!loading}
            style={[styles.input, loading && styles.inputDisabled]}
            onChangeText={(text) => handleChange(index, text)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
            keyboardType="numeric"
            maxLength={1}
            selectTextOnFocus
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 20,
  },
  label: {
    color: 'white',
    fontSize: 16,
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    width: 50,
    height: 60,
    borderWidth: 2,
    borderColor: '#785a28',
    borderRadius: 8,
    backgroundColor: 'black',
    color: '#f0e6d2',
    fontSize: 32,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  inputDisabled: {
    opacity: 0.5,
  },
});

