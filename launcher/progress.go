package main

// Progress : fenêtre (Windows) ou console qui suit l'installation ; Cancelled devient vrai si l'utilisateur
// ferme la fenêtre.
type Progress interface {
	Set(frac float64, msg string)
	Cancelled() bool
	Close()
}

type nopProgress struct{}

func (nopProgress) Set(float64, string) {}
func (nopProgress) Cancelled() bool     { return false }
func (nopProgress) Close()              {}
